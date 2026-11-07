import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup } from "./test-cleanup.mjs";

const root = new URL("..", import.meta.url).pathname;
const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...inherited } = process.env;
const env = { ...inherited, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
const write = (cwd, text) => { writeFileSync(join(cwd, "a.txt"), text); git(cwd, "add", "a.txt"); git(cwd, "commit", "-qm", text); };
const tops = [];
cleanup(() => { for (const top of tops) rmSync(top, { recursive: true, force: true }); });

function repo(onMain, onBranch = (b) => write(b, "branch\n"), { check = "exit 3", reviewedAs, pnpm } = {}) {
  const top = mkdtempSync(join(tmpdir(), "land-"));
  tops.push(top);
  const origin = join(top, "origin.git");
  const main = join(top, "barkever");
  const branch = join(top, "barkever-wt", "feature");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  git(top, "init", "-q", "-b", "main", main);
  mkdirSync(join(main, "scripts"));
  for (const f of ["land.mjs", "worktree.mjs", "scan-outgoing.mjs", "secrets.mjs"]) cpSync(join(root, "scripts", f), join(main, "scripts", f));
  writeFileSync(join(main, "a.txt"), "base\n");
  writeFileSync(join(main, "package.json"), JSON.stringify({ scripts: { check } }));
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
  if (pnpm) {
    mkdirSync(join(top, "bin"));
    writeFileSync(join(top, "bin", "pnpm"), `#!/bin/sh\n${pnpm}\n`, { mode: 0o755 });
  }
  const PATH = pnpm ? `${join(top, "bin")}:${env.PATH}` : env.PATH;
  const r = spawnSync("node", [join(main, "scripts/land.mjs"), "feature", "--reviewed", reviewedAs ?? reviewed.slice(0, 7)], { cwd: main, env: { ...env, HOME: top, PATH }, encoding: "utf8" });
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

const docsOnly = (b) => { mkdirSync(join(b, "docs")); writeFileSync(join(b, "docs/x.md"), "x\n"); git(b, "add", "docs"); git(b, "commit", "-qm", "docs"); };

const addsDependency = (m) => { writeFileSync(join(m, "pnpm-lock.yaml"), "new dependency\n"); git(m, "add", "pnpm-lock.yaml"); git(m, "commit", "-qm", "add a dependency"); };
const INSTALLS = { pnpm: "touch node_modules/dep", check: "test -f node_modules/dep" };

test("a branch rebased over a new dependency lands: it installs before the check needs the package", () => {
  const { r, main } = repo(addsDependency, docsOnly, INSTALLS);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(main, "rev-parse", "main"), git(join(main, "..", "origin.git"), "rev-parse", "main"));
});

test("a failed install stops the land before the check, and says so", () => {
  const { r, main, mainHead } = repo(addsDependency, docsOnly, { ...INSTALLS, pnpm: "exit 7" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^land: install what main now locks failed; main is untouched$/m);
  assert.doesNotMatch(r.stderr, /^land: npm run check$/m);
  assert.equal(git(main, "rev-parse", "HEAD"), mainHead);
});

for (const form of ["feature", "HEAD@{0}", "main", "abcdef"]) test(`--reviewed ${form} is refused`, () => {
  const { r, main, mainHead } = repo(() => {}, undefined, { check: "exit 0", reviewedAs: form });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /pass --reviewed <the sha the reviewer passed>/);
  assert.equal(git(main, "rev-parse", "HEAD"), mainHead);
});

test("a land sends main and nothing else, whatever else the repo holds", () => {
  const { r, main } = repo((m) => {
    git(m, "tag", "local-tag");
    git(m, "branch", "junk");
    git(m, "update-ref", "refs/entire/checkpoints/x", "HEAD");
  }, docsOnly, { check: "exit 0" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(join(main, "..", "origin.git"), "for-each-ref", "--format=%(refname)"), "refs/heads/main");
});

test("a rejected push says local main moved and origin did not", () => {
  const { r, main } = repo((m) => {
    const hook = join(m, "..", "origin.git", "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  }, docsOnly, { check: "exit 0" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^land: push main failed; local main is ahead of origin; origin is untouched$/m);
  assert.notEqual(git(main, "rev-parse", "main"), git(join(main, "..", "origin.git"), "rev-parse", "main"));
});

test("worktree.mjs refuses a folder that belongs to another repo", () => {
  const { main } = repo(() => {});
  const stale = join(main, "..", "barkever-wt", "stale");
  mkdirSync(stale, { recursive: true });
  git(stale, "init", "-q");
  const r = spawnSync("node", [join(main, "scripts/worktree.mjs"), "stale"], { cwd: main, env, encoding: "utf8" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /is not a worktree of this repo/);
  assert.equal(git(main, "branch", "--list", "stale"), "");
});

test("a roadmap refresh that fails does not fail a land that already pushed", () => {
  const run = repo((m) => {
    writeFileSync(join(m, "scripts", "roadmap.mjs"), `const fs = require("node:fs");fs.writeFileSync("where.txt", process.cwd() + " " + process.argv[2] + " " + (fs.readFileSync(".git/land.pid", "utf8") === String(process.ppid)));process.exit(9)\n`.replace(/^/, "import { createRequire } from 'node:module';const require=createRequire(import.meta.url);"));
    git(m, "add", "scripts/roadmap.mjs");
    git(m, "commit", "-qm", "add roadmap");
  }, (b) => {
    mkdirSync(join(b, "docs"));
    writeFileSync(join(b, "docs", "note.md"), "a note\n");
    git(b, "add", "docs/note.md");
    git(b, "commit", "-qm", "a note");
  }, { check: "exit 0" });
  assert.equal(run.r.status, 0, run.r.stderr);
  assert.match(run.r.stdout, /landed feature on main/);
  assert.match(run.r.stderr, /roadmap did not refresh/);
  assert.equal(readFileSync(join(run.main, "where.txt"), "utf8"), `${realpathSync(run.main)} --publish true`);
  assert.ok(!existsSync(join(run.main, ".git/land.pid")), "the land removes its mark when it ends");
  assert.equal(git(run.main, "rev-parse", "origin/main"), git(run.main, "rev-parse", "main"));
});

test("a land refused for its sha leaves the running land's mark alone", () => {
  const held = process.pid;
  const run = repo((m) => writeFileSync(join(m, ".git/land.pid"), String(held)), undefined, { reviewedAs: "0000000" });
  assert.equal(run.r.status, 1);
  assert.equal(readFileSync(join(run.main, ".git/land.pid"), "utf8"), String(held));
});

test("a second land refuses to start while the first is alive, and names the mark", () => {
  const held = process.pid;
  const run = repo((m) => writeFileSync(join(m, ".git/land.pid"), String(held)));
  assert.equal(run.r.status, 1);
  assert.match(run.r.stderr, /another land is running \(pid \d+, .*land\.pid\); nothing changed/);
  assert.equal(readFileSync(join(run.main, ".git/land.pid"), "utf8"), String(held));
  assert.equal(git(run.main, "rev-parse", "HEAD"), run.mainHead);
});

test("a mark left by a dead land doesn't stop the next one", () => {
  const dead = spawnSync("node", ["-p", "process.pid"], { encoding: "utf8" }).stdout.trim();
  const run = repo((m) => writeFileSync(join(m, ".git/land.pid"), dead), (b) => {
    mkdirSync(join(b, "docs"));
    writeFileSync(join(b, "docs", "note.md"), "a note\n");
    git(b, "add", "docs/note.md");
    git(b, "commit", "-qm", "a note");
  }, { check: "exit 0" });
  assert.equal(run.r.status, 0, run.r.stderr);
  assert.ok(!existsSync(join(run.main, ".git/land.pid")));
});
