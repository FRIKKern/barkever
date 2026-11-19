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
const node = (cwd, ...args) => spawnSync(process.execPath, args, { cwd, env, encoding: "utf8" });

function barkever() {
  const dir = join(top, "barkever");
  const files = git(root, "ls-files", "--cached", "--others", "--exclude-standard").split("\n").filter((f) => f && existsSync(join(root, f)) && statSync(join(root, f)).isFile());
  for (const f of files) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    copyFileSync(join(root, f), join(dir, f));
  }
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "barkever");
  for (const d of ["node_modules", "app/node_modules"]) symlinkSync(join(root, d), join(dir, d));
  return dir;
}

function barkpark(here) {
  const dir = join(top, "barkpark");
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

test("a Barkpark change that breaks the types or the conformance tests plans a report, never a push", () => {
  const here = barkever();
  const bp = barkpark(here);
  const first = node(here, "scripts/pack-sync.mjs", bp);
  assert.equal(first.status, 0, first.stderr);
  git(here, "add", "-A", "conformance");
  git(here, "commit", "-q", "-m", "pack from the fake Barkpark");
  const types = join(bp, "api/priv/portable_doc/conformance/conformance.d.mts");
  const helper = join(bp, "api/priv/portable_doc/conformance/conformance.mjs");
  assert.match(readFileSync(types, "utf8"), /^export interface ConformOptions \{$/m);
  writeFileSync(types, readFileSync(types, "utf8").replace(/^export interface ConformOptions \{$/m, "export interface ConformOptions {\n  version: 2"));
  assert.match(readFileSync(helper, "utf8"), /no golden pack at/);
  writeFileSync(helper, readFileSync(helper, "utf8").replace("no golden pack at", "no PortableDoc pack at"));
  git(bp, "commit", "-qam", "types and wording");
  const out = join(top, "plan");
  const r = node(here, "scripts/pack-plan.mjs", bp, "--out", out);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const planned = JSON.parse(readFileSync(join(out, "plan.json"), "utf8"));
  assert.deepEqual(planned, { action: "report", source: git(bp, "rev-parse", "HEAD"), moved: [], failed: ["types", "conformance-test"] });
  assert.ok(!existsSync(join(out, "sync.bundle")), "a report carries no commit");
  assert.match(r.stdout, /types fails on the new pack:[\s\S]*version/);
});
