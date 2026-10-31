import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...inherited } = process.env;
const env = { ...inherited, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
const write = (cwd, text) => { writeFileSync(join(cwd, "a.txt"), text); git(cwd, "add", "a.txt"); git(cwd, "commit", "-qm", text); };
const tops = [];
after(() => { for (const top of tops) rmSync(top, { recursive: true, force: true }); });

function repo(onMain, onBranch = (b) => write(b, "branch\n")) {
  const top = mkdtempSync(join(tmpdir(), "land-"));
  tops.push(top);
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
  onBranch(branch);
  onMain(main);
  git(main, "push", "-q", "origin", "main");
  const reviewed = git(branch, "rev-parse", "HEAD");
  const r = spawnSync("node", [join(main, "scripts/land.mjs"), "feature", "--reviewed", reviewed.slice(0, 7)], { cwd: main, env, encoding: "utf8" });
  return { r, main, branch, reviewed, mainHead: git(main, "rev-parse", "HEAD") };
}

function assertBack({ r, main, branch, reviewed, mainHead }) {
  assert.equal(r.status, 1, r.stderr);
  assert.equal(git(branch, "symbolic-ref", "HEAD"), "refs/heads/feature");
  assert.equal(git(branch, "rev-parse", "HEAD"), reviewed);
  assert.notEqual(spawnSync("git", ["rev-parse", "-q", "--verify", "REBASE_HEAD"], { cwd: branch, env }).status, 0, "REBASE_HEAD left behind");
  assert.equal(git(branch, "status", "--porcelain", "--untracked-files=no"), "");
  assert.equal(git(main, "rev-parse", "HEAD"), mainHead);
}

test("a conflicting rebase is aborted: the branch is back at the reviewed sha and the error names the file", () => {
  const run = repo((m) => write(m, "main\n"));
  assertBack(run);
  const named = run.r.stderr.match(/rebase onto main failed on a\.txt; rebase aborted, feature is back at (\w{10})/);
  assert.ok(named, run.r.stderr);
  assert.ok(run.reviewed.startsWith(named[1]));
});

test("a path main deleted and the branch changed is named too", () => {
  const run = repo((m) => { git(m, "rm", "-q", "a.txt"); git(m, "commit", "-qm", "drop a"); });
  assertBack(run);
  assert.match(run.r.stderr, /rebase onto main failed on a\.txt; rebase aborted/);
});

test("a rebase that never starts fails as before, without a stack", () => {
  const run = repo(
    (m) => { writeFileSync(join(m, "b.txt"), "main\n"); git(m, "add", "b.txt"); git(m, "commit", "-qm", "add b"); },
    (b) => { write(b, "branch\n"); writeFileSync(join(b, "b.txt"), "untracked\n"); },
  );
  assertBack(run);
  assert.match(run.r.stderr, /^land: rebase onto main failed; main is untouched$/m);
});

test("a step after a clean rebase still fails as before", () => {
  const { r } = repo((m) => { writeFileSync(join(m, "b.txt"), "main\n"); git(m, "add", "b.txt"); git(m, "commit", "-qm", "add b"); });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^land: npm run check failed; main is untouched$/m);
});
