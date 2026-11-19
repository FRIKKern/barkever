import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup } from "./test-cleanup.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const top = mkdtempSync(join(tmpdir(), "pack-plan-"));
cleanup([top]);
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (dir, path, text) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};
let runs = 0;
const node = (cwd, args, more = {}) => spawnSync(process.execPath, args, { cwd, env: { ...env, ...more }, encoding: "utf8" });

function barkever() {
  const dir = join(top, `barkever-${runs++}`);
  const files = git(root, "ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter((f) => f && existsSync(join(root, f)) && statSync(join(root, f)).isFile());
  for (const f of files) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    copyFileSync(join(root, f), join(dir, f));
  }
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "barkever");
  for (const d of ["node_modules", "app/node_modules", "mac/node_modules"]) symlinkSync(join(root, d), join(dir, d));
  return dir;
}

function barkpark(here) {
  const dir = join(top, `barkpark-${runs++}`);
  const pack = join(here, "conformance/pack");
  const stamp = JSON.parse(readFileSync(join(pack, "goldens/stamp.json"), "utf8"));
  const blocks = Object.fromEntries(Object.entries(stamp.files).filter(([f]) => f.startsWith("blocks/")));
  for (const f of Object.keys(blocks)) write(dir, `api/priv/portable_doc/goldens/${f}`, readFileSync(join(pack, "goldens", f), "utf8"));
  write(dir, "api/priv/portable_doc/goldens/stamp.json", `${JSON.stringify({ ...stamp, files: blocks }, null, 2)}\n`);
  for (const f of ["conformance.mjs", "conformance.d.mts"]) write(dir, `api/priv/portable_doc/conformance/${f}`, readFileSync(join(pack, f), "utf8"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "pack");
  return dir;
}

function synced() {
  const here = barkever();
  const bp = barkpark(here);
  const first = node(here, ["scripts/pack-sync.mjs", bp]);
  assert.equal(first.status, 0, first.stderr);
  git(here, "add", "-A", "conformance");
  git(here, "commit", "-q", "-m", "pack from the fake Barkpark");
  return { here, bp };
}

const plan = (here, bp, name, more) => {
  const out = join(top, name);
  const summary = join(top, `${name}.md`);
  const r = node(here, ["scripts/pack-plan.mjs", bp, "--out", out, "--summary", summary], more);
  return { r, out, summary: existsSync(summary) ? readFileSync(summary, "utf8") : "", planned: existsSync(join(out, "plan.json")) ? JSON.parse(readFileSync(join(out, "plan.json"), "utf8")) : undefined };
};
const PACK = "api/priv/portable_doc/conformance";

test("a same-meaning rewrite of the pack plans a push, and every test that reads the pack stays green", { timeout: 900000 }, () => {
  const { here, bp } = synced();
  const types = join(bp, PACK, "conformance.d.mts");
  writeFileSync(types, readFileSync(types, "utf8").replace(/^export interface (\w+) \{$/gm, "export type $1 = {"));
  writeFileSync(join(bp, PACK, "conformance.mjs"), `${readFileSync(join(bp, PACK, "conformance.mjs"), "utf8")}\n`);
  git(bp, "commit", "-qam", "the same meaning, written another way");
  const { r, out, summary, planned } = plan(here, bp, "same");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(planned, { action: "push", source: git(bp, "rev-parse", "HEAD") }, summary);
  assert.ok(existsSync(join(out, "sync.bundle")));
  assert.doesNotMatch(summary, /fails on the new pack/);
  if (!process.env.PACK_PLAN_INNER) assert.doesNotMatch(summary, /left to that plan/, "the tests that read the pack ran");
});

test("a Barkpark change that breaks consumers plans a report naming each failed check, a new unlisted pack test included", () => {
  const { here, bp } = synced();
  const held = git(bp, "rev-parse", "HEAD");
  write(here, "scripts/zz-new-reader.test.mjs", `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\ntest("held", () => assert.match(readFileSync(new URL("../conformance/pack/SOURCE.md", import.meta.url), "utf8"), /${held}/));\n`);
  git(here, "add", "-A");
  git(here, "commit", "-q", "-m", "a test no list names");
  writeFileSync(join(bp, PACK, "conformance.d.mts"), "export {}\n");
  git(bp, "commit", "-qam", "types gone");
  const { r, out, summary, planned } = plan(here, bp, "broken", { PACK_PLAN_INNER: "1" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(planned, { action: "report", source: git(bp, "rev-parse", "HEAD"), moved: [], failed: ["check-repo", "types", "test:scripts/zz-new-reader.test.mjs"] }, summary);
  assert.ok(!existsSync(join(out, "sync.bundle")), "a report carries no commit");
  assert.match(summary, /types fails on the new pack:[\s\S]*conformance\.tsx/);
});

test("a plan that stops says why in the run summary", () => {
  const { here, bp } = synced();
  const golden = git(bp, "ls-files", "api/priv/portable_doc/goldens/blocks").split("\n")[0];
  writeFileSync(join(bp, golden), "{}\n");
  git(bp, "commit", "-qam", "a golden its stamp does not name");
  const { r, summary } = plan(here, bp, "refused");
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(summary, /^pack-plan: Barkpark's pack is at odds with its own stamp, nothing taken:\nsource goldens\/blocks\/.+: differs from its stamp$/m);
});
