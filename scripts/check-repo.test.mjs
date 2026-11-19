import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, mkdirSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { PACK_DIR } from "./pack-door.mjs";
import { problems } from "./check-repo.mjs";
import { cleanup } from "./test-cleanup.mjs";

const temp = mkdtempSync(join(tmpdir(), "check-repo-"));
cleanup([temp]);

const root = new URL("..", import.meta.url).pathname;
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  .split("\n").filter((f) => f && !f.startsWith("app/node_modules"))
  .filter((f) => { try { return statSync(join(root, f)).isFile(); } catch { return false; } });

const cli = (cwd) => new Promise((done) => execFile("node", ["scripts/check-repo.mjs"], { cwd, encoding: "utf8" }, (error, stdout, stderr) => done({ status: error ? error.code : 0, stdout, stderr })));
const clean = cli(root);

const TYPE_ERROR = "export const n: number = 'not a number'\n";
const typePlants = { "app/e2e/planted.ts": "app", "mac/e2e/planted.ts": "mac", "mac/src/planted.ts": "mac" };
function copy() {
  const dir = mkdtempSync(join(temp, "copy-"));
  for (const f of tracked) { mkdirSync(dirname(join(dir, f)), { recursive: true }); cpSync(join(root, f), join(dir, f)); }
  for (const m of ["node_modules", "app/node_modules", "mac/node_modules"]) symlinkSync(join(root, m), join(dir, m));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}
const typed = (() => {
  const dir = copy();
  for (const f of Object.keys(typePlants)) writeFileSync(join(dir, f), TYPE_ERROR);
  return cli(dir);
})();

const texts = new Map();
const sizes = new Map();
const cached = (map, f, load) => (map.has(f) ? map.get(f) : map.set(f, load(join(root, f))).get(f));
function repo() {
  const planted = new Map();
  const read = (f) => (planted.has(f) ? planted.get(f) : cached(texts, f, (p) => readFileSync(p, "utf8")));
  const size = (f) => (planted.has(f) ? Buffer.byteLength(planted.get(f)) : cached(sizes, f, (p) => statSync(p).size));
  return { read, write: (f, text) => planted.set(f, text), problems: () => problems([...new Set([...tracked, ...planted.keys()])], read, size) };
}
const checked = (plant) => { const d = repo(); plant(d); return d.problems(); };

test("a --test-timeout of 2147483647 ms, the most Node takes, passes", () => {
  assert.deepEqual(checked(testTimeout(" --test-timeout=2147483647")), []);
});

test("a --deadline of 2147483647 ms, the most own-tmp takes, passes", () => {
  assert.deepEqual(checked(deadline(" --deadline=2147483647")), []);
});

test("the guarded run the split plants start with passes by itself, and with a second guarded run after it", () => {
  for (const rest of ["", ` && ${GUARDED_RUN}`]) assert.deepEqual(checked(afterGuardedRun(rest)), []);
});

test("a package.json with no scripts passes", () => {
  assert.deepEqual(checked((d) => d.write("fixtures/planted/package.json", "{}")), []);
});

const macTest = (change) => (d) => {
  const p = JSON.parse(d.read("mac/package.json"));
  p.scripts.test = change(p.scripts.test);
  d.write("mac/package.json", JSON.stringify(p));
};
const testTimeout = (flag) => macTest((cmd) => cmd.replace(/ --test-timeout=\d+/, flag));
const deadline = (flag) => macTest((cmd) => cmd.replace(/ --deadline=\d+/, flag));
const GUARDED_RUN = "node ../scripts/own-tmp.mjs --deadline=1200000 node --test --test-timeout=300000 a";
const afterGuardedRun = (rest) => macTest(() => GUARDED_RUN + rest);
const NO_TIMEOUT = "mac/package.json: script \"test\" runs node --test without a --test-timeout=";
const NO_DEADLINE = "mac/package.json: script \"test\" runs node --test outside own-tmp.mjs --deadline=";
const plants = {
  "word cap": (d) => d.write("README.md", d.read("README.md") + " word".repeat(400)),
  "no picture in a top-level doc": (d) => d.write("docs/NOTES.md", "# Notes\n\nJust words.\n"),
  "image outside reference/ or docs/img/": (d) => d.write("shot.webp", d.read("package.json")),
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
  "banned dependency": (d) => { const p = JSON.parse(d.read("package.json")); p.dependencies = { next: "1" }; d.write("package.json", JSON.stringify(p)); },
  "secret": (d) => d.write("leak.txt", ["OPENAI", "API", "KEY"].join("_") + "=abc123\n"),
  "a session token in a pack golden": [(d) => { const g = `${PACK_DIR}/goldens/blocks/paragraph.golden.json`; d.write(g, d.read(g).replace("{", `{"note": "${["bp", "sess_"].join("")}${"a".repeat(20)}",`)); }, `${PACK_DIR}/goldens/blocks/paragraph.golden.json: looks like a secret`],
  "a shell script that names the pack folder": [(d) => d.write("scripts/planted.sh", `ls ${PACK_DIR}\n`), "scripts/planted.sh:1: names the pack folder"],
  "a join wrapped one argument per line": [(d) => d.write("scripts/wrapped.test.mjs", `const at = join(\n  root,\n  '${PACK_DIR.split("/")[0]}',\n  '${PACK_DIR.split("/")[1]}',\n  'goldens',\n)\n`), "scripts/wrapped.test.mjs:3: names the pack folder"],
  "the pack folder's parts glued with sep": [(d) => d.write("scripts/sep.test.mjs", `const at = '${PACK_DIR.split("/")[0]}' + sep + '${PACK_DIR.split("/")[1]}'\n`), "scripts/sep.test.mjs:1: names the pack folder"],
  "a test that joins the pack folder's parts": [(d) => d.write("app/scripts/planted.test.ts", `const at = ['${PACK_DIR.split("/").join("', '")}', 'goldens']\n`), "app/scripts/planted.test.ts:1: names the pack folder"],
  "duplicate journey": (d) => d.write("JOURNEYS.md", d.read("JOURNEYS.md") + "| J01 | dup | x |\n"),
  "Barkpark path outside app/src/server": (d) => d.write("app/src/routes/planted.ts", "fetch('/v1/data/query')\n"),
  "Barkpark URL outside app/src/server": (d) => d.write("app/src/lib/planted.ts", "const u = 'https://guerrilla.barkpark.cloud'\n"),
};
for (const [name, planted] of Object.entries(plants)) {
  const [plant, says] = [planted].flat();
  test(`fails on: ${name}`, () => {
    const found = checked(plant);
    assert.ok(found.length > 0, `expected failure for ${name}`);
    if (says) {
      assert.equal(found.length, 1, found.join("\n"));
      assert.equal(found[0].slice(0, says.length), says);
    }
  });
}

test("clean copy passes", async () => {
  const r = await clean;
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^check-repo: ok \(\d+ files\)$/m);
});

for (const [f, project] of Object.entries(typePlants)) test(`fails on: type error in ${dirname(f)}`, async () => {
  const r = await typed;
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /^check-repo: 3 problem\(s\)\n/);
  assert.match(r.stderr, new RegExp(`^  ✗ tsc -p ${project}: ${f.replace(".", "\\.")}\\(1,\\d+\\): error TS2322`, "m"));
});
