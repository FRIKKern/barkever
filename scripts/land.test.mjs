import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
const commit = (cwd, text, file = "a.txt") => { writeFileSync(join(cwd, file), text); git(cwd, "add", file); git(cwd, "commit", "-qm", text); };
const land = (main, reviewed) => spawnSync("node", [join(main, "scripts/land.mjs"), "feature", "--reviewed", reviewed], { cwd: main, env, encoding: "utf8" });

function repo(mainFile) {
  const top = mkdtempSync(join(tmpdir(), "land-"));
  const origin = join(top, "origin.git");
  const main = join(top, "barkever");
  const branch = join(top, "barkever-wt", "feature");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  git(top, "init", "-q", "-b", "main", main);
  mkdirSync(join(main, "scripts"));
  for (const f of ["land.mjs", "worktree.mjs"]) cpSync(join(root, "scripts", f), join(main, "scripts", f));
  writeFileSync(join(main, "a.txt"), "base\n");
  writeFileSync(join(main, "package.json"), JSON.stringify({ scripts: { check: "exit 3" } }));
  git(main, "add", ".");
  git(main, "commit", "-qm", "base");
  git(main, "remote", "add", "origin", origin);
  git(main, "push", "-q", "origin", "main");
  git(main, "worktree", "add", "-q", "-b", "feature", branch, "main");
  mkdirSync(join(branch, "node_modules"));
  commit(branch, "branch\n");
  commit(main, "main\n", mainFile);
  git(main, "push", "-q", "origin", "main");
  return { main, branch, reviewed: git(branch, "rev-parse", "HEAD"), mainHead: git(main, "rev-parse", "HEAD") };
}

test("a conflicting rebase is aborted: the branch is back at the reviewed sha and the error names the file", () => {
  const { main, branch, reviewed, mainHead } = repo("a.txt");
  const r = land(main, reviewed.slice(0, 7));
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /rebase onto main failed on a\.txt; rebase aborted, feature is back at (\w{10})/);
  assert.ok(reviewed.startsWith(r.stderr.match(/back at (\w{10})/)[1]));
  assert.equal(git(branch, "symbolic-ref", "HEAD"), "refs/heads/feature");
  assert.equal(git(branch, "rev-parse", "HEAD"), reviewed);
  assert.notEqual(spawnSync("git", ["rev-parse", "-q", "--verify", "REBASE_HEAD"], { cwd: branch }).status, 0, "REBASE_HEAD left behind");
  assert.equal(git(branch, "status", "--porcelain", "--untracked-files=no"), "");
  assert.equal(git(main, "rev-parse", "HEAD"), mainHead);
});

test("a step after a clean rebase still fails as before", () => {
  const { main, reviewed } = repo("b.txt");
  const r = land(main, reviewed.slice(0, 7));
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^land: npm run check failed; main is untouched$/m);
});
