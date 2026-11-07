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
const originHead = (main) => git(join(main, "..", "origin.git"), "log", "-1", "--format=%s", "main");
const tops = [];
cleanup(() => { for (const top of tops) rmSync(top, { recursive: true, force: true }); });

function repo(onMain, onBranch = (b) => write(b, "branch\n"), { check = "exit 3", prepush, pnpmExit = 0, reviewedAs, onPull, pnpm, unpushed = () => {} } = {}) {
  const top = mkdtempSync(join(tmpdir(), "land-"));
  tops.push(top);
  const origin = join(top, "origin.git");
  const main = join(top, "barkever");
  const branch = join(top, "barkever-wt", "feature");
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  git(top, "init", "-q", "-b", "main", main);
  mkdirSync(join(main, "scripts"));
  for (const f of ["land.mjs", "worktree.mjs", "scan-outgoing.mjs", "secrets.mjs", "heavy.mjs"]) cpSync(join(root, "scripts", f), join(main, "scripts", f));
  writeFileSync(join(main, "a.txt"), "base\n");
  writeFileSync(join(main, "gone.txt"), "old\n");
  writeFileSync(join(main, "package.json"), JSON.stringify({ scripts: { check, ...(prepush && { prepush }) } }));
  git(main, "add", ".");
  git(main, "commit", "-qm", "base");
  git(main, "remote", "add", "origin", origin);
  git(main, "push", "-q", "origin", "main");
  git(main, "worktree", "add", "-q", "-b", "feature", branch, "main");
  mkdirSync(join(branch, "node_modules"));
  onBranch(branch);
  onMain(main);
  git(main, "push", "-q", "origin", "main");
  unpushed(main);
  const reviewed = git(branch, "rev-parse", "HEAD");
  mkdirSync(join(top, "bin"));
  writeFileSync(join(top, "bin", "pnpm"), `#!/bin/sh\n${pnpm ?? `exit ${pnpmExit}`}\n`, { mode: 0o755 });
  if (onPull) writeFileSync(join(top, "bin", "git"), `#!/bin/sh\nif [ "$1" = pull ]; then (cd "${branch}" && ${onPull}); fi\nexec ${execFileSync("which", ["git"], { encoding: "utf8" }).trim()} "$@"\n`, { mode: 0o755 });
  const mainHead = git(main, "rev-parse", "HEAD");
  const r = spawnSync("node", [join(main, "scripts/land.mjs"), "feature", "--reviewed", reviewedAs ?? reviewed.slice(0, 7)], { cwd: main, env: { ...env, HOME: top, HEAVY_DIR: join(top, "heavy"), PATH: `${join(top, "bin")}:${env.PATH}` }, encoding: "utf8" });
  return { r, top, main, branch, reviewed, mainHead };
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
    (m) => {
      writeFileSync(join(m, "b.txt"), "main\n");
      git(m, "add", "b.txt");
      git(m, "commit", "-qm", "add b");
      writeFileSync(join(m, ".git/hooks/pre-rebase"), '#!/bin/sh\n[ "$(git symbolic-ref --short HEAD)" = feature ] && exit 1\nexit 0\n', { mode: 0o755 });
    },
  );
  assertBack(run);
  assert.match(run.r.stderr, /^land: rebase onto main failed; main is untouched$/m);
});

test("a step after a clean rebase still fails as before", () => {
  const { r } = repo((m) => { writeFileSync(join(m, "b.txt"), "main\n"); git(m, "add", "b.txt"); git(m, "commit", "-qm", "add b"); });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^land: npm run check failed; feature is back at \w{10}; main is untouched$/m);
});

test("a step that fails after a rebase over a moved main puts the branch back, so the next land takes the same sha", () => {
  const run = repo((m) => { writeFileSync(join(m, "b.txt"), "main\n"); git(m, "add", "b.txt"); git(m, "commit", "-qm", "add b"); });
  assertBack(run);
  const { main, branch, reviewed } = run;
  writeFileSync(join(main, "c.txt"), "later\n");
  git(main, "add", "c.txt");
  git(main, "commit", "-qm", "main moves again");
  git(main, "push", "-q", "origin", "main");
  assert.equal(git(branch, "rev-parse", "HEAD"), reviewed);
  const again = spawnSync("node", [join(main, "scripts/land.mjs"), "feature", "--reviewed", reviewed.slice(0, 7)], { cwd: main, env: { ...env, HOME: join(main, "..") }, encoding: "utf8" });
  assert.equal(again.status, 1);
  assert.doesNotMatch(again.stderr, /pass --reviewed/);
  assert.match(again.stderr, /^land: npm run check failed; feature is back at/m);
  assert.equal(git(branch, "rev-parse", "HEAD"), reviewed);
});

const addB = (m) => { writeFileSync(join(m, "b.txt"), "main\n"); git(m, "add", "b.txt"); git(m, "commit", "-qm", "add b"); };

test("a red prepush puts the branch back at the reviewed sha", () => {
  const run = repo(addB, undefined, { check: "exit 0", prepush: "exit 4" });
  assertBack(run);
  assert.match(run.r.stderr, /^land: prepush \(queued\) failed; feature is back at \w{10}; main is untouched$/m);
});

test("a failed install puts the branch back", () => {
  const run = repo(addsDependency, undefined, { check: "exit 0", prepush: "exit 0", pnpmExit: 7 });
  assertBack(run);
  assert.match(run.r.stderr, /^land: install what main now locks failed; feature is back at \w{10}; main is untouched$/m);
});

test("a secret the no-app-effect scan refuses puts the branch back", () => {
  const onBranch = (b) => { mkdirSync(join(b, "scripts"), { recursive: true }); writeFileSync(join(b, "scripts/arms.mjs"), `export const key = "AKIA${"A".repeat(16)}";\n`); git(b, "add", "scripts/arms.mjs"); git(b, "commit", "-qm", "arms"); };
  const run = repo(addB, onBranch, { check: "exit 0" });
  assertBack(run);
  assert.match(run.r.stderr, /^land: no app effect: secret scan failed; feature is back at \w{10}; main is untouched$/m);
});

test("a commit made during a green prepush stops the land: it stays on the branch and nothing reaches origin", () => {
  const { r, main, branch, top } = repo(addB, undefined, { check: "exit 0", prepush: "echo late > late.txt; git add late.txt; git commit -qm late" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /moved during the land.*nothing landed; main is untouched$/m);
  assert.equal(git(branch, "log", "-1", "--format=%s"), "late");
  assert.equal(git(main, "log", "-1", "--format=%s").includes("late"), false);
  assert.equal(git(top, "--git-dir", join(top, "origin.git"), "log", "--format=%s", "main"), "add b\nbase");
});

test("a commit amended during a green check stops the land, so what was scanned is what would land", () => {
  const onBranch = (b) => { mkdirSync(join(b, "scripts"), { recursive: true }); writeFileSync(join(b, "scripts/arms.mjs"), "export const a = 1;\n"); git(b, "add", "."); git(b, "commit", "-qm", "arms"); };
  const { r, top } = repo(addB, onBranch, { check: "git commit -q --amend -m amended; exit 0" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /moved during the land/);
  assert.equal(git(top, "--git-dir", join(top, "origin.git"), "log", "--format=%s", "main").includes("amended"), false);
});

test("a folder that changes during a green check stops the land: an edit, or another branch", () => {
  for (const check of ["echo fix >> a.txt; exit 0", "git checkout -q -b z; exit 0"]) {
    const { r, top, main, branch } = repo(addB, undefined, { check, prepush: "exit 0" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /moved during the land/);
    assert.equal(existsSync(join(main, ".git/land.pid")), false);
    assert.equal(git(top, "--git-dir", join(top, "origin.git"), "log", "--format=%s", "main"), "add b\nbase");
    assert.equal(git(main, "log", "--format=%s", "main"), "add b\nbase");
    if (check.includes("fix")) assert.match(readFileSync(join(branch, "a.txt"), "utf8"), /fix/);
  }
});

test("a commit made during the pull stops the land before the rebase, so a red check can't drop it", () => {
  const onPull = `echo late > late.txt && ${execFileSync("which", ["git"], { encoding: "utf8" }).trim()} add late.txt && ${execFileSync("which", ["git"], { encoding: "utf8" }).trim()} commit -qm late`;
  const { r, branch } = repo(addB, undefined, { onPull });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /moved before the rebase; nothing landed/);
  assert.equal(git(branch, "log", "-1", "--format=%s"), "late");
  assert.equal(existsSync(join(branch, "late.txt")), true);
});

test("an untracked file a put-back would overwrite is kept, and the land says so", () => {
  const gone = (m) => { git(m, "rm", "-q", "gone.txt"); git(m, "commit", "-qm", "main drops gone"); };
  const onBranch = (b) => write(b, "branch\n");
  const { r, branch } = repo(gone, onBranch, { check: "echo 'new work' > gone.txt; exit 3" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /feature could not be put back and stays at \w{10}/);
  assert.equal(readFileSync(join(branch, "gone.txt"), "utf8"), "new work\n");
});

test("a new branch on the same sha during the land is not moved, and the land doesn't claim feature is back", () => {
  const { r, branch } = repo(addB, undefined, { check: "git checkout -q -b z; exit 3" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /changed during the land/);
  assert.equal(git(branch, "symbolic-ref", "HEAD"), "refs/heads/z");
  assert.equal(git(branch, "rev-parse", "z"), git(branch, "rev-parse", "feature"));
});

test("a worktree folder gone during the land still reports the failed step, with no stack", () => {
  const { r } = repo(addB, undefined, { check: 'mv "$PWD" "$PWD.gone"; exit 3' });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^land: npm run check failed; feature could not be put back and stays at \w{10}; main is untouched$/m);
  assert.doesNotMatch(r.stderr, /at .*land\.mjs:\d+/);
});

test("a fast-forward main refuses puts the branch back", () => {
  const onBranch = (b) => { write(b, "branch\n"); writeFileSync(join(b, "new.txt"), "branch\n"); git(b, "add", "new.txt"); git(b, "commit", "-qm", "new"); };
  const run = repo(addB, onBranch, { check: "exit 0", prepush: 'echo mine > "$(git worktree list --porcelain | head -1 | cut -d" " -f2)/new.txt"' });
  assertBack(run);
  assert.match(run.r.stderr, /^land: fast-forward main failed; feature is back at \w{10}; main is untouched$/m);
  assert.equal(readFileSync(join(run.main, "new.txt"), "utf8"), "mine\n");
});

test("an edit made during the land is kept: the branch is not put back", () => {
  const { r, branch } = repo(addB, undefined, { check: "echo mine >> a.txt; exit 3" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /changed during the land/);
  assert.match(readFileSync(join(branch, "a.txt"), "utf8"), /mine/);
});

test("a commit made during the land is kept: the branch is not put back", () => {
  const { r, branch } = repo(addB, undefined, { check: "echo more > more.txt; git add more.txt; git commit -qm more; exit 3" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /changed during the land/);
  assert.equal(git(branch, "log", "-1", "--format=%s"), "more");
  assert.ok(existsSync(join(branch, "more.txt")));
});

test("a folder that moved to another branch during the land keeps that branch where it was", () => {
  const { r, branch } = repo(addB, undefined, { check: "git checkout -q -b other; echo o > o.txt; git add o.txt; git commit -qm other; exit 3" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /changed during the land/);
  assert.equal(git(branch, "symbolic-ref", "HEAD"), "refs/heads/other");
  assert.equal(git(branch, "log", "-1", "--format=%s"), "other");
});

test("a reset that cannot run still reports the failed step", () => {
  const { r } = repo(addB, undefined, { check: 'touch "$(git rev-parse --git-path index.lock)"; exit 3' });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^land: npm run check failed; feature could not be put back and stays at \w{10}; main is untouched$/m);
});

const docsOnly = (b) => { mkdirSync(join(b, "docs")); writeFileSync(join(b, "docs/x.md"), "x\n"); git(b, "add", "docs"); git(b, "commit", "-qm", "docs"); };

const addsDependency = (m) => { writeFileSync(join(m, "pnpm-lock.yaml"), "new dependency\n"); git(m, "add", "pnpm-lock.yaml"); git(m, "commit", "-qm", "add a dependency"); };
const INSTALLS = { pnpm: "touch node_modules/dep", check: "test -f node_modules/dep" };

test("a branch rebased over a new dependency lands: it installs before the check needs the package", () => {
  const { r, main } = repo(addsDependency, docsOnly, INSTALLS);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(main, "rev-parse", "main"), git(join(main, "..", "origin.git"), "rev-parse", "main"));
});

test("a repo with no lockfile runs no install step", () => {
  const { r } = repo(addB);
  assert.doesNotMatch(r.stderr, /^land: install what main now locks$/m);
  assert.match(r.stderr, /^land: npm run check$/m);
});

test("a failed install stops the land before the check, and says so", () => {
  const { r, main, mainHead } = repo(addsDependency, docsOnly, { ...INSTALLS, pnpm: "exit 7" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^land: install what main now locks failed; feature is back at \w{10}; main is untouched$/m);
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

test("worktree.mjs refuses an existing worktree with uncommitted changes, naming its path, unless --reuse; a clean one says it is reused", () => {
  const { main, branch } = repo(() => {});
  const worktree = (...args) => spawnSync("node", [join(main, "scripts/worktree.mjs"), "feature", ...args], { cwd: main, env, encoding: "utf8" });
  const clean = worktree();
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.stdout.trim(), realpathSync(branch));
  assert.match(clean.stderr, /reusing/);
  for (const change of ["a.txt", "new.txt"]) {
    writeFileSync(join(branch, change), "someone's edit\n");
    const refused = worktree();
    assert.equal(refused.status, 1, change);
    assert.equal(refused.stdout, "");
    assert.ok(refused.stderr.includes(realpathSync(branch)), refused.stderr);
    assert.match(refused.stderr, new RegExp(change.replace(".", "\\.")));
    assert.equal(worktree("--reuse").stdout.trim(), realpathSync(branch));
    git(branch, "checkout", "-q", "--", ".");
    git(branch, "clean", "-qf");
  }
});

test("a land refuses a branch with an untracked file, because the check would pass on what main won't get", () => {
  const run = repo(() => {}, (b) => { write(b, "branch\n"); writeFileSync(join(b, "stray.txt"), "untracked\n"); }, { check: "exit 0" });
  assert.equal(run.r.status, 1, run.r.stderr);
  assert.match(run.r.stderr, /untracked files in the branch .*\nstray\.txt/);
  assert.equal(originHead(run.main), "base");
  assert.doesNotMatch(run.r.stdout, /landed/);
});

const stoppedAtEdit = (b) => {
  docsOnly(b);
  git(b, "-c", "sequence.editor=sed -i.bak s/^pick/edit/", "rebase", "-q", "-i", "HEAD~1");
  writeFileSync(join(b, "docs/y.md"), "y\n");
  git(b, "add", "docs");
  git(b, "commit", "-qm", "made mid-rebase");
};

function assertRebaseKept(run) {
  assert.equal(run.r.status, 1, run.r.stderr);
  assert.match(run.r.stderr, /the branch .* has an unfinished rebase-merge/);
  assert.ok(existsSync(git(run.branch, "rev-parse", "--path-format=absolute", "--git-path", "rebase-merge")));
  assert.equal(originHead(run.main), "base");
}

test("a rebase the owner has in progress is left alone, with the commit it made", () => {
  const run = repo(() => {}, stoppedAtEdit, { check: "exit 0" });
  assertRebaseKept(run);
  assert.equal(git(run.branch, "rev-parse", "HEAD"), run.reviewed);
});

test("a rebase in progress is left alone even with the branch checked out over it", () => {
  assertRebaseKept(repo(() => {}, (b) => { stoppedAtEdit(b); git(b, "checkout", "-q", "feature"); }, { check: "exit 0" }));
});

test("a rebase that starts while the land brings main up to origin is left alone too", () => {
  const run = repo(() => {}, docsOnly, { check: "exit 0", onPull: `git -c sequence.editor="sed -i.bak s/^pick/edit/" rebase -q -i HEAD~1` });
  assertRebaseKept(run);
});

test("a tag named like the branch or main stops the land before it can push the tagged commit", () => {
  for (const name of ["feature", "main"]) {
    const { r, main } = repo(() => {}, docsOnly, { check: "exit 0", unpushed: (m) => git(m, "tag", name) });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, new RegExp(`a tag named ${name} would stand in`));
    assert.equal(originHead(main), "base");
  }
});

test("a merge left open is not run through", () => {
  const { r, main } = repo(() => {}, (b) => {
    docsOnly(b);
    git(b, "checkout", "-q", "-b", "side", "HEAD~1");
    writeFileSync(join(b, "c.txt"), "c\n");
    git(b, "add", "c.txt");
    git(b, "commit", "-qm", "side");
    git(b, "checkout", "-q", "feature");
    git(b, "merge", "-q", "--no-commit", "-s", "ours", "side");
  }, { check: "exit 0" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /has an unfinished MERGE_HEAD/);
  assert.equal(originHead(main), "base");
});

test("a move out of the app into docs still needs the reviewed sha", () => {
  const { r } = repo(() => {}, (b) => { mkdirSync(join(b, "docs")); git(b, "mv", "a.txt", "docs/a.txt"); git(b, "commit", "-qm", "move"); }, { check: "exit 0", reviewedAs: "0000000" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /pass --reviewed/);
});

test("a main checkout on another branch stops the land, and nothing claims to have landed", () => {
  const { r, main } = repo((m) => git(m, "checkout", "-q", "-b", "other"), docsOnly, { check: "exit 0" });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /the main checkout .* is on other, not main/);
  assert.doesNotMatch(r.stdout, /landed/);
  assert.equal(originHead(main), "base");
});

test("a docs branch over an unpushed app commit on local main runs prepush before anything reaches origin", () => {
  const { r, main } = repo(() => {}, docsOnly, { check: "exit 0", prepush: "exit 4", unpushed: (m) => { writeFileSync(join(m, "app.txt"), "app\n"); git(m, "add", "app.txt"); git(m, "commit", "-qm", "app"); } });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /^land: prepush \(queued\) failed; feature is back at \w{10}; main is untouched$/m);
  assert.doesNotMatch(r.stderr, /no app effect/);
  assert.equal(originHead(main), "base");
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
