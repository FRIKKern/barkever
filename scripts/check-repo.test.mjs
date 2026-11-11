import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { cleanup } from "./test-cleanup.mjs";

const temp = mkdtempSync(join(tmpdir(), "check-repo-"));
cleanup(() => rmSync(temp, { recursive: true, force: true }));

const root = new URL("..", import.meta.url).pathname;
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  .split("\n").filter((f) => f && !f.startsWith("app/node_modules"));

function copy() {
  const dir = mkdtempSync(join(temp, "copy-"));
  for (const f of tracked) {
    try { mkdirSync(dirname(join(dir, f)), { recursive: true }); cpSync(join(root, f), join(dir, f)); } catch {}
  }
  for (const m of ["node_modules", "app/node_modules", "mac/node_modules"]) symlinkSync(join(root, m), join(dir, m));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}
const run = (dir) => spawnSync("node", ["scripts/check-repo.mjs"], { cwd: dir, encoding: "utf8" });

test("clean copy passes", () => {
  const r = run(copy());
  assert.equal(r.status, 0, r.stderr);
});

test("a --test-timeout of 2147483647 ms, the most Node takes, passes", () => {
  const dir = copy();
  testTimeout(" --test-timeout=2147483647")(dir);
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
});

test("a --deadline of 2147483647 ms, the most own-tmp takes, passes", () => {
  const dir = copy();
  deadline(" --deadline=2147483647")(dir);
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
});

test("the guarded run the split plants start with passes by itself, and with a second guarded run after it", () => {
  for (const rest of ["", ` && ${GUARDED_RUN}`]) {
    const dir = copy();
    afterGuardedRun(rest)(dir);
    const r = run(dir);
    assert.equal(r.status, 0, r.stderr);
  }
});

test("a package.json with no scripts passes", () => {
  const dir = copy();
  mkdirSync(join(dir, "fixtures/planted"), { recursive: true });
  writeFileSync(join(dir, "fixtures/planted/package.json"), "{}");
  const r = run(dir);
  assert.equal(r.status, 0, r.stderr);
});

const macTest = (change) => (d) => {
  const p = JSON.parse(readFileSync(join(d, "mac/package.json"), "utf8"));
  p.scripts.test = change(p.scripts.test);
  writeFileSync(join(d, "mac/package.json"), JSON.stringify(p));
};
const testTimeout = (flag) => macTest((cmd) => cmd.replace(/ --test-timeout=\d+/, flag));
const deadline = (flag) => macTest((cmd) => cmd.replace(/ --deadline=\d+/, flag));
const GUARDED_RUN = "node ../scripts/own-tmp.mjs --deadline=1200000 node --test --test-timeout=300000 a";
const afterGuardedRun = (rest) => macTest(() => GUARDED_RUN + rest);
const NO_TIMEOUT = "check-repo: 1 problem(s)\n  ✗ mac/package.json: script \"test\" runs node --test without a --test-timeout=";
const NO_DEADLINE = "check-repo: 1 problem(s)\n  ✗ mac/package.json: script \"test\" runs node --test outside own-tmp.mjs --deadline=";
const plants = {
  "word cap": (d) => writeFileSync(join(d, "README.md"), readFileSync(join(d, "README.md"), "utf8") + " word".repeat(400)),
  "no picture in a top-level doc": (d) => writeFileSync(join(d, "docs/NOTES.md"), "# Notes\n\nJust words.\n"),
  "image outside reference/ or docs/img/": (d) => cpSync(join(d, "package.json"), join(d, "shot.webp")),
  "node --test without --test-timeout": [testTimeout(""), NO_TIMEOUT],
  "--test-timeout=0, which is none": [testTimeout(" --test-timeout=0"), NO_TIMEOUT],
  "--test-timeout past 2^31 - 1 ms": [testTimeout(" --test-timeout=2147483648"), NO_TIMEOUT],
  "--test-timeout with a space, not =": [testTimeout(" --test-timeout 300000"), NO_TIMEOUT],
  "--test-timeout with no number": [testTimeout(" --test-timeout="), NO_TIMEOUT],
  "--deadline=0, which is none": [deadline(" --deadline=0"), NO_DEADLINE],
  "--deadline past 2^31 - 1 ms": [deadline(" --deadline=2147483648"), NO_DEADLINE],
  "node --test with no whole-run deadline": [deadline(""), NO_DEADLINE],
  "a second node --test after && without --test-timeout": [afterGuardedRun(" && node --test b"), NO_TIMEOUT],
  "a second node --test after || without --test-timeout": [afterGuardedRun(" || node --test b"), NO_TIMEOUT],
  "a second node --test after ; without --test-timeout": [afterGuardedRun(" ; node --test b"), NO_TIMEOUT],
  "a second node --test after | without --test-timeout": [afterGuardedRun(" | node --test b"), NO_TIMEOUT],
  "a second node --test after & without --test-timeout": [afterGuardedRun(" & node --test b"), NO_TIMEOUT],
  "a second node --test on the next line without --test-timeout": [afterGuardedRun("\nnode --test b"), NO_TIMEOUT],
  "a second node --test after && outside own-tmp.mjs": [afterGuardedRun(" && node --test --test-timeout=300000 b"), NO_DEADLINE],
  "a second node --test after ; outside own-tmp.mjs": [afterGuardedRun(";node --test --test-timeout=300000 b"), NO_DEADLINE],
  "banned dependency": (d) => { const p = JSON.parse(readFileSync(join(d, "package.json"), "utf8")); p.dependencies = { next: "1" }; writeFileSync(join(d, "package.json"), JSON.stringify(p)); },
  "secret": (d) => writeFileSync(join(d, "leak.txt"), ["OPENAI", "API", "KEY"].join("_") + "=abc123\n"),
  "duplicate journey": (d) => writeFileSync(join(d, "JOURNEYS.md"), readFileSync(join(d, "JOURNEYS.md"), "utf8") + "| J01 | dup | x |\n"),
  "Barkpark path outside app/src/server": (d) => { mkdirSync(join(d, "app/src/routes"), { recursive: true }); writeFileSync(join(d, "app/src/routes/planted.ts"), "fetch('/v1/data/query')\n"); },
  "type error in app/e2e": (d) => writeFileSync(join(d, "app/e2e/planted.ts"), "export const n: number = 'not a number'\n"),
  "type error in mac/e2e": (d) => writeFileSync(join(d, "mac/e2e/planted.ts"), "export const n: number = 'not a number'\n"),
  "type error in mac/src": (d) => writeFileSync(join(d, "mac/src/planted.ts"), "export const n: number = 'not a number'\n"),
  "Barkpark URL outside app/src/server": (d) => { mkdirSync(join(d, "app/src/lib"), { recursive: true }); writeFileSync(join(d, "app/src/lib/planted.ts"), "const u = 'https://guerrilla.barkpark.cloud'\n"); },
};
for (const [name, planted] of Object.entries(plants)) {
  const [plant, says = "check-repo: "] = [planted].flat();
  test(`fails on: ${name}`, () => {
    const dir = copy();
    plant(dir);
    const r = run(dir);
    assert.equal(r.status, 1, `expected failure for ${name}; got: ${r.stdout}`);
    assert.equal(r.stderr.slice(0, says.length), says);
  });
}
