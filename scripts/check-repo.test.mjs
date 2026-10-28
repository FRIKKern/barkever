// Tests the guard itself: each planted violation must make check-repo fail, and the clean repo must pass.
// Run: node --test scripts/check-repo.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  .split("\n").filter((f) => f && !f.startsWith("app/node_modules"));

function copy() {
  const dir = mkdtempSync(join(tmpdir(), "check-repo-"));
  for (const f of tracked) {
    try { mkdirSync(dirname(join(dir, f)), { recursive: true }); cpSync(join(root, f), join(dir, f)); } catch {}
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}
const run = (dir) => spawnSync("node", ["scripts/check-repo.mjs"], { cwd: dir, encoding: "utf8" });

test("clean copy passes", () => {
  const r = run(copy());
  assert.equal(r.status, 0, r.stderr);
});

const plants = {
  "word cap": (d) => writeFileSync(join(d, "README.md"), readFileSync(join(d, "README.md"), "utf8") + " word".repeat(400)),
  "no picture in a top-level doc": (d) => writeFileSync(join(d, "docs/NOTES.md"), "# Notes\n\nJust words.\n"),
  "image outside reference/ or docs/img/": (d) => cpSync(join(d, "package.json"), join(d, "shot.webp")),
  "banned dependency": (d) => { const p = JSON.parse(readFileSync(join(d, "package.json"), "utf8")); p.dependencies = { next: "1" }; writeFileSync(join(d, "package.json"), JSON.stringify(p)); },
  // Assembled at run time so this file never holds the pattern it plants.
  "secret": (d) => writeFileSync(join(d, "leak.txt"), ["OPENAI", "API", "KEY"].join("_") + "=abc123\n"),
  "duplicate journey": (d) => writeFileSync(join(d, "JOURNEYS.md"), readFileSync(join(d, "JOURNEYS.md"), "utf8") + "| J01 | dup | x |\n"),
  "Barkpark path outside app/src/server": (d) => { mkdirSync(join(d, "app/src/routes"), { recursive: true }); writeFileSync(join(d, "app/src/routes/planted.ts"), "fetch('/v1/data/query')\n"); },
  "Barkpark URL outside app/src/server": (d) => { mkdirSync(join(d, "app/src/lib"), { recursive: true }); writeFileSync(join(d, "app/src/lib/planted.ts"), "const u = 'https://guerrilla.barkpark.cloud'\n"); },
};
for (const [name, plant] of Object.entries(plants)) {
  test(`fails on: ${name}`, () => {
    const dir = copy();
    plant(dir);
    const r = run(dir);
    assert.equal(r.status, 1, `expected failure for ${name}; got: ${r.stdout}`);
  });
}
