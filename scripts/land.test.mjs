import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { RISKY } from "./risky.mjs";
import { cleanup } from "./test-cleanup.mjs";

const root = new URL("..", import.meta.url).pathname;
const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...inherited } = process.env;
const env = { ...inherited, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const REAL_GIT = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
const sh = (cmd, args, options) => new Promise((done) => execFile(cmd, args, { encoding: "utf8", ...options }, (error, stdout, stderr) => done({ status: error ? error.code : 0, stdout, stderr })));
const gitWith = async (more, cwd, ...args) => {
  const r = await sh("git", args, { cwd, env: { ...env, ...more } });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${r.stderr}`);
  return r.stdout.trim();
};
const git = (cwd, ...args) => gitWith({}, cwd, ...args);
const write = async (cwd, text) => { writeFileSync(join(cwd, "a.txt"), text); await git(cwd, "add", "a.txt"); await git(cwd, "commit", "-qm", text); };
const originHead = (main) => git(join(main, "..", "origin.git"), "log", "-1", "--format=%s", "staging");
const originLog = (main, name) => git(join(main, "..", "origin.git"), "log", "--format=%s", name);
const landedHead = async ({ main, branch }) => assert.equal(await git(join(main, "..", "origin.git"), "rev-parse", "staging"), await git(branch, "rev-parse", "HEAD"));
const temp = mkdtempSync(join(tmpdir(), "land-"));
cleanup([temp]);

const TOOLS = ["land.mjs", "risky.mjs", "worktree.mjs", "scan-outgoing.mjs", "secrets.mjs", "heavy.mjs"];
const template = await (async () => {
  const top = mkdtempSync(join(temp, "template-"));
  const origin = join(top, "origin.git");
  const main = join(top, "barkever");
  await git(top, "init", "-q", "--template=", "--bare", "-b", "main", origin);
  await git(top, "init", "-q", "--template=", "-b", "main", main);
  for (const dir of [join(origin, "hooks"), join(main, ".git/hooks"), join(main, "scripts")]) mkdirSync(dir);
  for (const f of TOOLS) cpSync(join(root, "scripts", f), join(main, "scripts", f));
  writeFileSync(join(main, "a.txt"), "base\n");
  writeFileSync(join(main, "gone.txt"), "old\n");
  writeFileSync(join(main, "package.json"), JSON.stringify({ scripts: { check: "exit 3" } }));
  await git(main, "add", ".");
  await git(main, "commit", "-qm", "base");
  await git(main, "remote", "add", "origin", origin);
  await git(main, "push", "-q", "origin", "main", "main:staging");
  await git(main, "worktree", "add", "-q", "-b", "feature", join(top, "barkever-wt", "feature"), "main");
  mkdirSync(join(top, "barkever-wt", "feature", "node_modules"));
  return top;
})();

function fresh() {
  const top = mkdtempSync(join(temp, "land-"));
  cpSync(template, top, { recursive: true });
  for (const f of ["barkever/.git/config", "barkever/.git/worktrees/feature/gitdir", "barkever-wt/feature/.git"]) {
    const path = join(top, f);
    writeFileSync(path, readFileSync(path, "utf8").replaceAll(realpathSync(template), realpathSync(top)).replaceAll(template, top));
  }
  return top;
}

const npm = (check, prepush = 'echo "npm error Missing script: test:scripts" >&2; exit 1') => `#!/bin/sh\ncase "$1 $2" in\n"run check") ${check}\n;;\n"run test:scripts") ${prepush}\n;;\n*) exit 98\n;;\nesac\n`;

async function repo(onMain, onBranch = (b) => write(b, "branch\n"), { check = "exit 3", prepush, pnpmExit = 0, reviewedAs, onPull, pnpm, unpushed = () => {} } = {}) {
  const top = fresh();
  const main = join(top, "barkever");
  const branch = join(top, "barkever-wt", "feature");
  await onBranch(branch);
  await onMain(main);
  await git(main, "push", "-q", "origin", "main");
  await unpushed(main);
  const reviewed = await git(branch, "rev-parse", "HEAD");
  mkdirSync(join(top, "bin"));
  writeFileSync(join(top, "bin", "pnpm"), `#!/bin/sh\n${pnpm ?? `exit ${pnpmExit}`}\n`, { mode: 0o755 });
  writeFileSync(join(top, "bin", "npm"), npm(check, prepush), { mode: 0o755 });
  if (onPull) writeFileSync(join(top, "bin", "git"), `#!/bin/sh\nif [ "$1" = pull ]; then (cd "${branch}" && ${onPull}); fi\nexec ${REAL_GIT} "$@"\n`, { mode: 0o755 });
  const mainHead = await git(main, "rev-parse", "HEAD");
  const claim = reviewedAs === null ? [] : ["--reviewed", typeof reviewedAs === "function" ? reviewedAs(reviewed) : reviewedAs ?? reviewed.slice(0, 7)];
  const r = await sh("node", [join(main, "scripts/land.mjs"), "feature", ...claim], { cwd: main, env: { ...env, HOME: top, HEAVY_DIR: join(top, "heavy"), PATH: `${join(top, "bin")}:${env.PATH}` }, encoding: "utf8" });
  return { r, top, main, branch, reviewed, mainHead };
}

async function assertBack({ r, main, branch, reviewed, mainHead }) {
  assert.equal(r.status, 1, r.stderr);
  assert.equal(await git(branch, "symbolic-ref", "HEAD"), "refs/heads/feature");
  assert.equal(await git(branch, "rev-parse", "HEAD"), reviewed);
  assert.notEqual((await sh("git", ["rev-parse", "-q", "--verify", "REBASE_HEAD"], { cwd: branch, env })).status, 0, "REBASE_HEAD left behind");
  assert.equal(await git(branch, "status", "--porcelain", "--untracked-files=no"), "");
  assert.equal(await git(main, "rev-parse", "HEAD"), mainHead);
}

describe("land", { concurrency: availableParallelism() }, () => {
  test("a conflicting rebase is aborted: the branch is back at the reviewed sha and the error names the file", async () => {
    const run = await repo((m) => write(m, "main\n"));
    await assertBack(run);
    const named = run.r.stderr.match(/rebase onto main failed on a\.txt; rebase aborted, feature is back at (\w{10})/);
    assert.ok(named, run.r.stderr);
    assert.ok(run.reviewed.startsWith(named[1]));
  });

  test("a path main deleted and the branch changed is named too", async () => {
    const run = await repo(async (m) => { await git(m, "rm", "-q", "a.txt"); await git(m, "commit", "-qm", "drop a"); });
    await assertBack(run);
    assert.match(run.r.stderr, /rebase onto main failed on a\.txt; rebase aborted/);
  });

  test("a rebase that never starts fails as before, without a stack", async () => {
    const run = await repo(
      async (m) => {
        writeFileSync(join(m, "b.txt"), "main\n");
        await git(m, "add", "b.txt");
        await git(m, "commit", "-qm", "add b");
        writeFileSync(join(m, ".git/hooks/pre-rebase"), '#!/bin/sh\n[ "$(git symbolic-ref --short HEAD)" = feature ] && exit 1\nexit 0\n', { mode: 0o755 });
      },
    );
    await assertBack(run);
    assert.match(run.r.stderr, /^land: rebase onto main failed; main is untouched$/m);
  });

  test("a step after a clean rebase still fails as before", async () => {
    const { r } = await repo(async (m) => { writeFileSync(join(m, "b.txt"), "main\n"); await git(m, "add", "b.txt"); await git(m, "commit", "-qm", "add b"); });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^land: npm run check failed; feature is back at \w{10}; main is untouched$/m);
  });

  test("a step that fails after a rebase over a moved main puts the branch back, so the next land takes the same sha", async () => {
    const run = await repo(async (m) => { writeFileSync(join(m, "b.txt"), "main\n"); await git(m, "add", "b.txt"); await git(m, "commit", "-qm", "add b"); });
    await assertBack(run);
    const { main, branch, reviewed } = run;
    writeFileSync(join(main, "c.txt"), "later\n");
    await git(main, "add", "c.txt");
    await git(main, "commit", "-qm", "main moves again");
    await git(main, "push", "-q", "origin", "main");
    assert.equal(await git(branch, "rev-parse", "HEAD"), reviewed);
    const again = await sh("node", [join(main, "scripts/land.mjs"), "feature", "--reviewed", reviewed.slice(0, 7)], { cwd: main, env: { ...env, HOME: join(main, "..") }, encoding: "utf8" });
    assert.equal(again.status, 1);
    assert.doesNotMatch(again.stderr, /pass --reviewed/);
    assert.match(again.stderr, /^land: npm run check failed; feature is back at/m);
    assert.equal(await git(branch, "rev-parse", "HEAD"), reviewed);
  });

  const addB = async (m) => { writeFileSync(join(m, "b.txt"), "main\n"); await git(m, "add", "b.txt"); await git(m, "commit", "-qm", "add b"); };

  test("a red prepush puts the branch back at the reviewed sha", async () => {
    const run = await repo(addB, undefined, { check: "exit 0", prepush: "exit 4" });
    await assertBack(run);
    assert.match(run.r.stderr, /^land: script tests failed; feature is back at \w{10}; main is untouched$/m);
  });

  test("a failed install puts the branch back", async () => {
    const run = await repo(addsDependency, undefined, { check: "exit 0", prepush: "exit 0", pnpmExit: 7 });
    await assertBack(run);
    assert.match(run.r.stderr, /^land: install what main now locks failed; feature is back at \w{10}; main is untouched$/m);
  });

  test("a secret the no-app-effect scan refuses puts the branch back", async () => {
    const onBranch = async (b) => { mkdirSync(join(b, "scripts"), { recursive: true }); writeFileSync(join(b, "scripts/arms.mjs"), `export const key = "AKIA${"A".repeat(16)}";\n`); await git(b, "add", "scripts/arms.mjs"); await git(b, "commit", "-qm", "arms"); };
    const run = await repo(addB, onBranch, { check: "exit 0" });
    await assertBack(run);
    assert.match(run.r.stderr, /^land: no app effect: secret scan failed; feature is back at \w{10}; main is untouched$/m);
  });

  test("a commit made during a green prepush stops the land: it stays on the branch and nothing reaches origin", async () => {
    const { r, main, branch, top } = await repo(addB, undefined, { check: "exit 0", prepush: "echo late > late.txt; git add late.txt; git commit -qm late" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /moved during the land.*nothing landed; main is untouched$/m);
    assert.equal(await git(branch, "log", "-1", "--format=%s"), "late");
    assert.equal((await git(main, "log", "-1", "--format=%s")).includes("late"), false);
    assert.equal(await git(top, "--git-dir", join(top, "origin.git"), "log", "--format=%s", "main"), "add b\nbase");
  });

  test("a commit amended during a green check stops the land, so what was scanned is what would land", async () => {
    const onBranch = async (b) => { mkdirSync(join(b, "scripts"), { recursive: true }); writeFileSync(join(b, "scripts/arms.mjs"), "export const a = 1;\n"); await git(b, "add", "."); await git(b, "commit", "-qm", "arms"); };
    const { r, top } = await repo(addB, onBranch, { check: "git commit -q --amend -m amended; exit 0" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /moved during the land/);
    assert.equal((await git(top, "--git-dir", join(top, "origin.git"), "log", "--format=%s", "main")).includes("amended"), false);
  });

  test("a folder that changes during a green check stops the land: an edit, or another branch", async () => {
    for (const check of ["echo fix >> a.txt; exit 0", "git checkout -q -b z; exit 0"]) {
      const { r, top, main, branch } = await repo(addB, undefined, { check, prepush: "exit 0" });
      assert.equal(r.status, 1, r.stderr);
      assert.match(r.stderr, /moved during the land/);
      assert.equal(existsSync(join(main, ".git/land.pid")), false);
      assert.equal(await git(top, "--git-dir", join(top, "origin.git"), "log", "--format=%s", "main"), "add b\nbase");
      assert.equal(await git(main, "log", "--format=%s", "main"), "add b\nbase");
      if (check.includes("fix")) assert.match(readFileSync(join(branch, "a.txt"), "utf8"), /fix/);
    }
  });

  test("a commit made during the pull stops the land before the rebase, so a red check can't drop it", async () => {
    const onPull = `echo late > late.txt && ${REAL_GIT} add late.txt && ${REAL_GIT} commit -qm late`;
    const { r, branch } = await repo(addB, undefined, { onPull });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /moved before the rebase; nothing landed/);
    assert.equal(await git(branch, "log", "-1", "--format=%s"), "late");
    assert.equal(existsSync(join(branch, "late.txt")), true);
  });

  test("an untracked file a put-back would overwrite is kept, and the land says so", async () => {
    const gone = async (m) => { await git(m, "rm", "-q", "gone.txt"); await git(m, "commit", "-qm", "main drops gone"); };
    const onBranch = (b) => write(b, "branch\n");
    const { r, branch } = await repo(gone, onBranch, { check: "echo 'new work' > gone.txt; exit 3" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /feature could not be put back and stays at \w{10}/);
    assert.equal(readFileSync(join(branch, "gone.txt"), "utf8"), "new work\n");
  });

  test("a new branch on the same sha during the land is not moved, and the land doesn't claim feature is back", async () => {
    const { r, branch } = await repo(addB, undefined, { check: "git checkout -q -b z; exit 3" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /changed during the land/);
    assert.equal(await git(branch, "symbolic-ref", "HEAD"), "refs/heads/z");
    assert.equal(await git(branch, "rev-parse", "z"), await git(branch, "rev-parse", "feature"));
  });

  test("a worktree folder gone during the land still reports the failed step, with no stack", async () => {
    const { r } = await repo(addB, undefined, { check: 'mv "$PWD" "$PWD.gone"; exit 3' });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^land: npm run check failed; feature could not be put back and stays at \w{10}; main is untouched$/m);
    assert.doesNotMatch(r.stderr, /at .*land\.mjs:\d+/);
  });

  test("an edit made during the land is kept: the branch is not put back", async () => {
    const { r, branch } = await repo(addB, undefined, { check: "echo mine >> a.txt; exit 3" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /changed during the land/);
    assert.match(readFileSync(join(branch, "a.txt"), "utf8"), /mine/);
  });

  test("a commit made during the land is kept: the branch is not put back", async () => {
    const { r, branch } = await repo(addB, undefined, { check: "echo more > more.txt; git add more.txt; git commit -qm more; exit 3" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /changed during the land/);
    assert.equal(await git(branch, "log", "-1", "--format=%s"), "more");
    assert.ok(existsSync(join(branch, "more.txt")));
  });

  test("a folder that moved to another branch during the land keeps that branch where it was", async () => {
    const { r, branch } = await repo(addB, undefined, { check: "git checkout -q -b other; echo o > o.txt; git add o.txt; git commit -qm other; exit 3" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /changed during the land/);
    assert.equal(await git(branch, "symbolic-ref", "HEAD"), "refs/heads/other");
    assert.equal(await git(branch, "log", "-1", "--format=%s"), "other");
  });

  test("a reset that cannot run still reports the failed step", async () => {
    const { r } = await repo(addB, undefined, { check: 'touch "$(git rev-parse --git-path index.lock)"; exit 3' });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^land: npm run check failed; feature could not be put back and stays at \w{10}; main is untouched$/m);
  });

  const docsOnly = async (b) => { mkdirSync(join(b, "docs")); writeFileSync(join(b, "docs/x.md"), "x\n"); await git(b, "add", "docs"); await git(b, "commit", "-qm", "docs"); };

  const addsDependency = async (m) => { writeFileSync(join(m, "pnpm-lock.yaml"), "new dependency\n"); await git(m, "add", "pnpm-lock.yaml"); await git(m, "commit", "-qm", "add a dependency"); };
  const INSTALLS = { pnpm: "touch node_modules/dep", check: "test -f node_modules/dep" };

  test("a branch rebased over a new dependency lands: it installs before the check needs the package", async () => {
    const run = await repo(addsDependency, docsOnly, INSTALLS);
    assert.equal(run.r.status, 0, run.r.stderr);
    await landedHead(run);
  });

  test("a repo with no lockfile runs no install step", async () => {
    const { r } = await repo(addB);
    assert.doesNotMatch(r.stderr, /^land: install what main now locks$/m);
    assert.match(r.stderr, /^land: npm run check$/m);
  });

  test("a failed install stops the land before the check, and says so", async () => {
    const { r, main, mainHead } = await repo(addsDependency, docsOnly, { ...INSTALLS, pnpm: "exit 7" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^land: install what main now locks failed; feature is back at \w{10}; main is untouched$/m);
    assert.doesNotMatch(r.stderr, /^land: npm run check$/m);
    assert.equal(await git(main, "rev-parse", "HEAD"), mainHead);
  });

  const landAs = ({ main, top }, sha) => sh("node", [join(main, "scripts/land.mjs"), "feature", "--reviewed", sha.slice(0, 7)], { cwd: main, env: { ...env, HOME: top, HEAVY_DIR: join(top, "heavy"), PATH: `${join(top, "bin")}:${process.env.PATH}` }, encoding: "utf8" });

  async function rebasedOverContext() {
    const run = await repo(() => {}, () => {}, { reviewedAs: "abcdef" });
    const { main, branch } = run;
    const lines = (at, text) => { const all = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]; all[at] = text; return `${all.join("\n")}\n`; };
    writeFileSync(join(main, "long.txt"), lines(0, "1"));
    await git(main, "add", "long.txt");
    await git(main, "commit", "-qm", "long");
    await git(main, "push", "-q", "origin", "main");
    await git(branch, "rebase", "-q", "main");
    writeFileSync(join(branch, "long.txt"), lines(8, "reviewed line").replace("7\n", "7\nguard\n"));
    writeFileSync(join(branch, "z.txt"), "last line\n");
    writeFileSync(join(branch, "pic.bin"), Buffer.from([0, 1, 2, 3]));
    await git(branch, "add", ".");
    await git(branch, "commit", "-qm", "reviewed");
    const sha = await git(branch, "rev-parse", "HEAD");
    writeFileSync(join(main, "long.txt"), lines(4, "main moved a line nearby"));
    await git(main, "add", "long.txt");
    await git(main, "commit", "-qm", "context");
    await git(main, "push", "-q", "origin", "main");
    await git(branch, "rebase", "-q", "main");
    const land = (reviewed = sha) => landAs(run, reviewed);
    return { branch, sha, land };
  }

  test("a clean rebase over lines beside the change keeps its reviewed sha", async () => {
    const { branch, sha, land } = await rebasedOverContext();
    assert.notEqual(await git(branch, "rev-parse", "HEAD"), sha);
    const r = await land();
    assert.doesNotMatch(r.stderr, /pass --reviewed/);
    assert.match(r.stderr, /^land: npm run check failed/m);
  });

  for (const [what, change] of [
    ["a changed line", (b) => writeFileSync(join(b, "long.txt"), readFileSync(join(b, "long.txt"), "utf8").replace("reviewed line", "other line"))],
    ["a binary file", (b) => writeFileSync(join(b, "pic.bin"), Buffer.from([0, 1, 2, 4]))],
    ["the same line in another place", (b) => writeFileSync(join(b, "long.txt"), readFileSync(join(b, "long.txt"), "utf8").replace("guard\n", "").replace("1\n", "1\nguard\n"))],
    ["a trailing space on the last line", (b) => writeFileSync(join(b, "z.txt"), "last line \n")],
    ["a commit on top of the reviewed sha", (b) => writeFileSync(join(b, "other.txt"), "not reviewed\n")],
  ]) test(`${what} that differs from the reviewed sha is refused after a rebase`, async () => {
    const { branch, land } = await rebasedOverContext();
    await change(branch);
    await git(branch, "add", ".");
    await git(branch, "commit", "-q", "--amend", "--no-edit");
    const r = await land();
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /pass --reviewed <the sha the reviewer passed>/);
  });

  test("a head with no net change is refused, even with a reviewed sha already on main", async () => {
    const { branch, land } = await rebasedOverContext();
    const old = await git(branch, "rev-parse", "main~1");
    await git(branch, "reset", "-q", "--hard", "main");
    writeFileSync(join(branch, "z.txt"), "added\n");
    await git(branch, "add", ".");
    await git(branch, "commit", "-qm", "add");
    await git(branch, "rm", "-q", "z.txt");
    await git(branch, "commit", "-qm", "take it back");
    const r = await land(old);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /pass --reviewed <the sha the reviewer passed>/);
  });

  test("a criss-cross history is refused: a head can't drop main's code under a reviewed sha", async () => {
    const run = await repo(() => {}, () => {}, { reviewedAs: "abcdef" });
    const { main, branch } = run;
    const commit = async (cwd, file, text, day) => {
      writeFileSync(join(cwd, file), text);
      await git(cwd, "add", file);
      const at = `2030-01-0${day}T00:00:00`;
      await gitWith({ GIT_COMMITTER_DATE: at, GIT_AUTHOR_DATE: at }, cwd, "commit", "-qm", file);
    };
    await git(main, "switch", "-qc", "b2");
    await commit(main, "guard.txt", "guard\n", 1);
    await git(main, "switch", "-q", "main");
    await git(main, "switch", "-qc", "b1");
    await commit(main, "b1.txt", "b1\n", 2);
    await git(main, "switch", "-q", "main");
    await git(main, "merge", "-q", "--no-ff", "--no-edit", "b1");
    await git(main, "merge", "-q", "--no-ff", "--no-edit", "b2");
    await git(main, "push", "-q", "origin", "main");
    await git(branch, "merge", "-q", "--ff-only", "b1");
    await commit(branch, "f.txt", "reviewed\n", 3);
    const sha = await git(branch, "rev-parse", "HEAD");
    await git(branch, "merge", "-q", "--no-edit", "b2");
    await git(branch, "rm", "-q", "guard.txt");
    await git(branch, "commit", "-qm", "tidy");
    const r = await landAs(run, sha);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /pass --reviewed <the sha the reviewer passed>/);
  });

  for (const form of ["feature", "HEAD@{0}", "main", "abcdef"]) test(`--reviewed ${form} is refused`, async () => {
    const { r, main, mainHead } = await repo(() => {}, undefined, { check: "exit 0", reviewedAs: form });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /pass --reviewed <the sha the reviewer passed>/);
    assert.equal(await git(main, "rev-parse", "HEAD"), mainHead);
  });

  test("a real sha prefix of 6 characters is too short to name a review", async () => {
    const { r } = await repo(() => {}, undefined, { check: "exit 0", reviewedAs: (sha) => sha.slice(0, 6) });
    assert.match(r.stderr, /pass --reviewed <the sha the reviewer passed>/);
  });

  test("a head that moved keeps its review only while the patch is the same", async () => {
    let first;
    const amended = (text) => async (b) => { await write(b, "branch\n"); first = await git(b, "rev-parse", "HEAD"); writeFileSync(join(b, "a.txt"), text); await git(b, "add", "a.txt"); await git(b, "commit", "-q", "--amend", "-m", "amended"); };
    const same = await repo(() => {}, amended("branch\n"), { reviewedAs: () => first });
    assert.match(same.r.stderr, /^land: npm run check failed/m);
    const moved = await repo(() => {}, amended("changed\n"), { reviewedAs: () => first });
    assert.match(moved.r.stderr, /pass --reviewed <the sha the reviewer passed>/);
  });

  test("a branch with no patch of its own needs its own head named, not the patch", async () => {
    const { r } = await repo(() => {}, () => {}, { reviewedAs: (sha) => sha });
    assert.doesNotMatch(r.stderr, /pass --reviewed/);
    assert.match(r.stderr, /^land: npm run check failed/m);
  });

  test("a docs branch lands with no --reviewed", async () => {
    const run = await repo(() => {}, docsOnly, { check: "exit 0", reviewedAs: null });
    assert.equal(run.r.status, 0, run.r.stderr);
    assert.match(run.r.stdout, /^landed feature on staging at \w{7}; ci checks it, then the bot moves main$/m);
    await landedHead(run);
    assert.equal(await originLog(run.main, "main"), "base");
  });

  test("a docs branch holding a key stops at the secret scan, and origin does not move", async () => {
    const keyed = async (b) => { mkdirSync(join(b, "docs")); writeFileSync(join(b, "docs/x.md"), "gho_".concat("A1b2C3d4".repeat(5))); await git(b, "add", "docs"); await git(b, "commit", "-qm", "docs"); };
    const { r, main, mainHead } = await repo(() => {}, keyed, { check: "exit 0", reviewedAs: null });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /^land: no app effect: secret scan failed/m);
    assert.equal(await git(main, "rev-parse", "HEAD"), mainHead);
    assert.equal(await git(join(main, "..", "origin.git"), "rev-parse", "main"), mainHead);
    assert.equal(await git(join(main, "..", "origin.git"), "rev-parse", "staging"), mainHead);
  });

  test("worktree.mjs makes a new worktree on a new branch and prints its folder", async () => {
    const { main } = await repo(() => {}, undefined, { pnpm: "exit 0" });
    const PATH = `${join(main, "..", "bin")}:${env.PATH}`;
    const r = await sh("node", [join(main, "scripts/worktree.mjs"), "fresh"], { cwd: main, env: { ...env, PATH }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const dir = join(realpathSync(join(main, "..")), "barkever-wt", "fresh");
    assert.equal(r.stdout.trim(), dir);
    assert.equal(await git(dir, "symbolic-ref", "HEAD"), "refs/heads/fresh");
  });

  test("a land sends staging and nothing else, whatever else the repo holds", async () => {
    const { r, main } = await repo(async (m) => {
      await git(m, "tag", "local-tag");
      await git(m, "branch", "junk");
      await git(m, "update-ref", "refs/entire/checkpoints/x", "HEAD");
    }, docsOnly, { check: "exit 0" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(await git(join(main, "..", "origin.git"), "for-each-ref", "--format=%(refname)"), "refs/heads/main\nrefs/heads/staging");
  });

  test("a rejected push puts the branch back and says origin did not move", async () => {
    const run = await repo((m) => {
      const hook = join(m, "..", "origin.git", "hooks", "pre-receive");
      writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    }, docsOnly, { check: "exit 0" });
    await assertBack(run);
    assert.match(run.r.stderr, /^land: push staging failed; feature is back at \w{10}; origin is untouched$/m);
    assert.equal(await originLog(run.main, "staging"), "base");
  });

  test("worktree.mjs refuses a folder that belongs to another repo", async () => {
    const { main } = await repo(() => {});
    const stale = join(main, "..", "barkever-wt", "stale");
    mkdirSync(stale, { recursive: true });
    await git(stale, "init", "-q");
    const r = await sh("node", [join(main, "scripts/worktree.mjs"), "stale"], { cwd: main, env, encoding: "utf8" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /is not a worktree of this repo/);
    assert.equal(await git(main, "branch", "--list", "stale"), "");
  });

  test("worktree.mjs refuses an existing worktree with uncommitted changes, naming its path, unless --reuse; a clean one says it is reused", async () => {
    const { main, branch } = await repo(() => {});
    const worktree = (...args) => sh("node", [join(main, "scripts/worktree.mjs"), "feature", ...args], { cwd: main, env, encoding: "utf8" });
    const clean = await worktree();
    assert.equal(clean.status, 0, clean.stderr);
    assert.equal(clean.stdout.trim(), realpathSync(branch));
    assert.match(clean.stderr, /reusing/);
    for (const change of ["a.txt", "new.txt"]) {
      writeFileSync(join(branch, change), "someone's edit\n");
      const refused = await worktree();
      assert.equal(refused.status, 1, change);
      assert.equal(refused.stdout, "");
      assert.ok(refused.stderr.includes(realpathSync(branch)), refused.stderr);
      assert.match(refused.stderr, new RegExp(change.replace(".", "\\.")));
      assert.equal((await worktree("--reuse")).stdout.trim(), realpathSync(branch));
      await git(branch, "checkout", "-q", "--", ".");
      await git(branch, "clean", "-qf");
    }
  });

  test("a land refuses a branch with an untracked file, because the check would pass on what main won't get", async () => {
    const run = await repo(() => {}, async (b) => { await write(b, "branch\n"); writeFileSync(join(b, "stray.txt"), "untracked\n"); }, { check: "exit 0" });
    assert.equal(run.r.status, 1, run.r.stderr);
    assert.match(run.r.stderr, /untracked files in the branch .*\nstray\.txt/);
    assert.equal(await originHead(run.main), "base");
    assert.doesNotMatch(run.r.stdout, /landed/);
  });

  const stoppedAtEdit = async (b) => {
    await docsOnly(b);
    await git(b, "-c", "sequence.editor=sed -i.bak s/^pick/edit/", "rebase", "-q", "-i", "HEAD~1");
    writeFileSync(join(b, "docs/y.md"), "y\n");
    await git(b, "add", "docs");
    await git(b, "commit", "-qm", "made mid-rebase");
  };

  async function assertRebaseKept(run) {
    assert.equal(run.r.status, 1, run.r.stderr);
    assert.match(run.r.stderr, /the branch .* has an unfinished rebase-merge/);
    assert.ok(existsSync(await git(run.branch, "rev-parse", "--path-format=absolute", "--git-path", "rebase-merge")));
    assert.equal(await originHead(run.main), "base");
  }

  test("a rebase the owner has in progress is left alone, with the commit it made", async () => {
    const run = await repo(() => {}, stoppedAtEdit, { check: "exit 0" });
    await assertRebaseKept(run);
    assert.equal(await git(run.branch, "rev-parse", "HEAD"), run.reviewed);
  });

  test("a rebase in progress is left alone even with the branch checked out over it", async () => {
    await assertRebaseKept(await repo(() => {}, async (b) => { await stoppedAtEdit(b); await git(b, "checkout", "-q", "feature"); }, { check: "exit 0" }));
  });

  test("a rebase that starts while the land brings main up to origin is left alone too", async () => {
    const run = await repo(() => {}, docsOnly, { check: "exit 0", onPull: `git -c sequence.editor="sed -i.bak s/^pick/edit/" rebase -q -i HEAD~1` });
    await assertRebaseKept(run);
  });

  test("a tag named like the branch or main stops the land before it can push the tagged commit", async () => {
    for (const name of ["feature", "main"]) {
      const { r, main } = await repo(() => {}, docsOnly, { check: "exit 0", unpushed: (m) => git(m, "tag", name) });
      assert.equal(r.status, 1, r.stderr);
      assert.match(r.stderr, new RegExp(`a tag named ${name} would stand in`));
      assert.equal(await originHead(main), "base");
    }
  });

  test("a merge left open is not run through", async () => {
    const { r, main } = await repo(() => {}, async (b) => {
      await docsOnly(b);
      await git(b, "checkout", "-q", "-b", "side", "HEAD~1");
      writeFileSync(join(b, "c.txt"), "c\n");
      await git(b, "add", "c.txt");
      await git(b, "commit", "-qm", "side");
      await git(b, "checkout", "-q", "feature");
      await git(b, "merge", "-q", "--no-commit", "-s", "ours", "side");
    }, { check: "exit 0" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /has an unfinished MERGE_HEAD/);
    assert.equal(await originHead(main), "base");
  });

  test("a move out of the app into docs still needs the reviewed sha", async () => {
    const { r } = await repo(() => {}, async (b) => { mkdirSync(join(b, "docs")); await git(b, "mv", "a.txt", "docs/a.txt"); await git(b, "commit", "-qm", "move"); }, { check: "exit 0", reviewedAs: "0000000" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /pass --reviewed/);
  });

  test("a main checkout on another branch stops the land, and nothing claims to have landed", async () => {
    const { r, main } = await repo((m) => git(m, "checkout", "-q", "-b", "other"), docsOnly, { check: "exit 0" });
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /the main checkout .* is on other, not main/);
    assert.doesNotMatch(r.stdout, /landed/);
    assert.equal(await originHead(main), "base");
  });

  test("a docs branch cut from a local main that holds an unpushed app commit is refused: the app commit would ride along unreviewed", async () => {
    const run = await repo(() => {}, () => {}, { check: "exit 0", reviewedAs: null, unpushed: async (m) => {
      writeFileSync(join(m, "app.txt"), "app\n"); await git(m, "add", "app.txt"); await git(m, "commit", "-qm", "app");
      const b = join(m, "..", "barkever-wt", "feature");
      await git(b, "merge", "-q", "--ff-only", "main");
      await docsOnly(b);
    } });
    assert.equal(run.r.status, 1, run.r.stderr);
    assert.match(run.r.stderr, /would send more than docs.*nothing landed/);
    assert.equal(await originLog(run.main, "staging"), "base");
    assert.equal(await git(run.branch, "rev-parse", "HEAD"), run.reviewed);
  });

  for (const [folder, runs, skips] of [["app", "@barkever/app test", "@barkever/mac"], ["mac", "@barkever/mac test", "@barkever/app"]]) test(`a change under ${folder}/ runs that package's tests and no other suite`, async () => {
    const change = async (b) => { mkdirSync(join(b, folder)); writeFileSync(join(b, folder, "x.ts"), "x\n"); await git(b, "add", folder); await git(b, "commit", "-qm", folder); };
    const run = await repo(() => {}, change, { check: "exit 0", pnpm: 'echo "$@" >> "$HOME/pnpm.log"' });
    assert.equal(run.r.status, 0, run.r.stderr);
    const ran = readFileSync(join(run.top, "pnpm.log"), "utf8");
    assert.ok(ran.includes(`--filter ${runs}`), ran);
    assert.ok(!ran.includes(skips), ran);
    assert.doesNotMatch(run.r.stderr, /^land: script tests$/m);
    assert.match(run.r.stderr, /^land: secret scan$/m);
  });

  test("a change outside the known folders runs every suite", async () => {
    const run = await repo(() => {}, undefined, { check: "exit 0", prepush: "exit 0", pnpm: 'echo "$@" >> "$HOME/pnpm.log"' });
    assert.equal(run.r.status, 0, run.r.stderr);
    assert.match(run.r.stderr, /^land: script tests$/m);
    const ran = readFileSync(join(run.top, "pnpm.log"), "utf8");
    assert.ok(ran.includes("@barkever/app test") && ran.includes("@barkever/mac test"), ran);
  });

  test("an unpushed app commit on local main stays local: a docs land sends only its own commit", async () => {
    const run = await repo(() => {}, docsOnly, { check: "exit 0", unpushed: async (m) => { writeFileSync(join(m, "app.txt"), "app\n"); await git(m, "add", "app.txt"); await git(m, "commit", "-qm", "app"); } });
    assert.equal(run.r.status, 0, run.r.stderr);
    assert.equal(await originLog(run.main, "staging"), "docs\nbase");
    assert.equal(await originLog(run.main, "main"), "base");
  });

  const pending = async (m) => {
    await git(m, "checkout", "-q", "-b", "pending");
    writeFileSync(join(m, "p.txt"), "pending\n");
    await git(m, "add", "p.txt");
    await git(m, "commit", "-qm", "pending");
    await git(m, "push", "-q", "origin", "pending:staging");
    await git(m, "checkout", "-q", "main");
    await git(m, "branch", "-qD", "pending");
  };

  const everySuite = 'echo "$@" >> "$HOME/pnpm.log"';
  const ranEverySuite = (run) => {
    assert.match(run.r.stderr, /^land: script tests$/m);
    const ran = readFileSync(join(run.top, "pnpm.log"), "utf8");
    assert.ok(ran.includes("@barkever/app test") && ran.includes("@barkever/mac test"), ran);
  };

  test("a land goes on top of what staging holds and main does not yet, and main stays where it was", async () => {
    const run = await repo(pending, docsOnly, { check: "exit 0" });
    assert.equal(run.r.status, 0, run.r.stderr);
    assert.equal(await originLog(run.main, "staging"), "docs\npending\nbase");
    assert.match(run.r.stderr, /^land: rebase onto staging$/m);
    assert.equal(await originLog(run.main, "main"), "base");
    await landedHead(run);
  });

  test("a staging that only fell behind main is caught up by the land, with no merge", async () => {
    const run = await repo(addB, docsOnly, { check: "exit 0" });
    assert.equal(run.r.status, 0, run.r.stderr);
    assert.equal(await originLog(run.main, "staging"), "docs\nadd b\nbase");
    assert.match(run.r.stderr, /^land: rebase onto main$/m);
  });

  test("in a split, a docs branch cut after main's own commit still lands with no review: main's commit is not counted as the branch's", async () => {
    const run = await repo(async (m) => { await pending(m); await addB(m); }, () => {}, { check: "exit 0", prepush: "exit 0", pnpm: everySuite, reviewedAs: null, unpushed: async (m) => {
      const b = join(m, "..", "barkever-wt", "feature");
      await git(b, "merge", "-q", "--ff-only", "main");
      await docsOnly(b);
    } });
    assert.equal(run.r.status, 0, run.r.stderr);
    const origin = join(run.main, "..", "origin.git");
    assert.equal(await git(origin, "rev-list", "--count", "staging"), "5");
    ranEverySuite(run);
    assert.equal((await sh("git", ["merge-base", "--is-ancestor", "main", "staging"], { cwd: origin, env })).status, 0);
    await landedHead(run);
  });

  test("when main and staging each hold a commit the other lacks, the land merges staging in so the bot can move main again", async () => {
    const run = await repo(async (m) => { await pending(m); await addB(m); }, docsOnly, { check: "exit 0", prepush: "exit 0", pnpm: everySuite, reviewedAs: null });
    assert.equal(run.r.status, 0, run.r.stderr);
    const origin = join(run.main, "..", "origin.git");
    for (const subject of ["docs", "pending", "add b"]) assert.ok((await originLog(run.main, "staging")).split("\n").includes(subject), subject);
    assert.equal((await sh("git", ["merge-base", "--is-ancestor", "main", "staging"], { cwd: origin, env })).status, 0);
    assert.equal(await originLog(run.main, "main"), "add b\nbase");
    ranEverySuite(run);
  });

  const fakeRoadmap = (body, syncExit = 0) => async (m) => {
    writeFileSync(join(m, "scripts", "roadmap.mjs"), `import { mkdirSync, writeFileSync } from "node:fs";\nif (process.argv[2] === "--sync") { writeFileSync("../../synced.txt", "y"); process.exit(${syncExit}); }\nmkdirSync("docs/img", { recursive: true });\nwriteFileSync("docs/img/roadmap.svg", "new");\nwriteFileSync("docs/img/journeys.svg", "new");\n${body}\n`);
    await git(m, "add", "scripts/roadmap.mjs");
    await git(m, "commit", "-qm", "add roadmap");
  };

  test("a land redraws the roadmap as its own commit on top, then syncs GitHub", async () => {
    const run = await repo(fakeRoadmap(""), docsOnly, { check: "exit 0" });
    assert.equal(run.r.status, 0, run.r.stderr);
    assert.equal(await originLog(run.main, "staging"), "Roadmap: redraw from the Barkpark board\ndocs\nadd roadmap\nbase");
    await landedHead(run);
    assert.equal(readFileSync(join(run.top, "synced.txt"), "utf8"), "y");
  });

  test("a GitHub sync that fails does not fail a land that already pushed", async () => {
    const run = await repo(fakeRoadmap("", 9), docsOnly, { check: "exit 0" });
    assert.equal(run.r.status, 0, run.r.stderr);
    assert.match(run.r.stdout, /landed feature on staging/);
    assert.match(run.r.stderr, /milestones did not refresh/);
    await landedHead(run);
  });

  test("a clash between what main and staging each hold stops the land, puts the branch back, and says who must fix it", async () => {
    const clash = async (m) => {
      await git(m, "checkout", "-q", "-b", "pending");
      writeFileSync(join(m, "gone.txt"), "staging\n"); await git(m, "add", "gone.txt"); await git(m, "commit", "-qm", "pending");
      await git(m, "push", "-q", "origin", "pending:staging");
      await git(m, "checkout", "-q", "main");
      await git(m, "branch", "-qD", "pending");
      writeFileSync(join(m, "gone.txt"), "main\n"); await git(m, "add", "gone.txt"); await git(m, "commit", "-qm", "direct");
    };
    const run = await repo(clash, docsOnly, { check: "exit 0" });
    await assertBack(run);
    assert.match(run.r.stderr, /merge what staging holds and main lacks failed; main and staging each hold a commit that clashes/);
    assert.equal(await originLog(run.main, "staging"), "pending\nbase");
  });

  test("a roadmap that cannot be drawn does not stop the land, and leaves no half-drawn picture", async () => {
    const run = await repo(fakeRoadmap("process.exit(9);"), docsOnly, { check: "exit 0" });
    assert.equal(run.r.status, 0, run.r.stderr);
    assert.match(run.r.stderr, /the roadmap was not redrawn; the land goes on without it/);
    assert.equal(await originLog(run.main, "staging"), "docs\nadd roadmap\nbase");
    assert.equal(existsSync(join(run.branch, "docs/img/roadmap.svg")), false);
    assert.equal(await git(run.branch, "status", "--porcelain"), "");
  });

  test("a branch named staging is refused like main", async () => {
    const r = await sh("node", [join(root, "scripts/land.mjs"), "staging"], { encoding: "utf8" });
    assert.equal(r.status, 2);
  });

  test("a land refused for its sha leaves the running land's mark alone", async () => {
    const held = process.pid;
    const run = await repo((m) => writeFileSync(join(m, ".git/land.pid"), String(held)), undefined, { reviewedAs: "0000000" });
    assert.equal(run.r.status, 1);
    assert.equal(readFileSync(join(run.main, ".git/land.pid"), "utf8"), String(held));
  });

  test("a second land refuses to start while the first is alive, and names the mark", async () => {
    const held = process.pid;
    const run = await repo((m) => writeFileSync(join(m, ".git/land.pid"), String(held)));
    assert.equal(run.r.status, 1);
    assert.match(run.r.stderr, /another land is running \(pid \d+, .*land\.pid\); nothing changed/);
    assert.equal(readFileSync(join(run.main, ".git/land.pid"), "utf8"), String(held));
    assert.equal(await git(run.main, "rev-parse", "HEAD"), run.mainHead);
  });

  test("a mark left by a dead land doesn't stop the next one", async () => {
    const dead = (await sh("node", ["-p", "process.pid"], { encoding: "utf8" })).stdout.trim();
    const run = await repo((m) => writeFileSync(join(m, ".git/land.pid"), dead), async (b) => {
      mkdirSync(join(b, "docs"));
      writeFileSync(join(b, "docs", "note.md"), "a note\n");
      await git(b, "add", "docs/note.md");
      await git(b, "commit", "-qm", "a note");
    }, { check: "exit 0" });
    assert.equal(run.r.status, 0, run.r.stderr);
    assert.ok(!existsSync(join(run.main, ".git/land.pid")));
  });

  const RISKY_FILES = ["scripts/check-repo.mjs", "scripts/test-cleanup.mjs", "scripts/own-tmp.test.mjs", "scripts/land.mjs", ".github/workflows/ci.yml", "app/src/replica/merge.ts", "scripts/sync-act.sh", "scripts/act-token.sh", "scripts/promote.sh", "scripts/pack.mjs", "scripts/pack-compare.mjs", "scripts/pack-plan.mjs", "scripts/pack-plan.test.mjs", "scripts/pack-sync.mjs", "package.json", "pnpm-lock.yaml", "app/scripts/conformance.tsx", "conformance/conformance.test.mjs", "scripts/pack-door.mjs", "scripts/pack-door.d.mts", "scripts/sync-act-world.mjs", "scripts/sync-act-refusals.test.mjs", "scripts/keyed-jobs.json", "scripts/workflow-keys.mjs", "scripts/sync-act.test.mjs", "scripts/key-shims.mjs", "scripts/promote-world.mjs", "scripts/staging-holds.test.mjs", "scripts/ci-runs-every-test.test.mjs", "scripts/promote-reads-ci.test.mjs", "scripts/promote-ci-runs.json", "scripts/risky.mjs", "scripts/test-proof.mjs", "scripts/test-proof.test.mjs", "scripts/test-report.mjs", "scripts/test-scope.json"];

  test("every file on the risky list is seen as risky, and files off it are not", () => {
    for (const file of RISKY_FILES) assert.match(file, RISKY);
    for (const file of ["scripts/arms.mjs", "app/src/ui/a.ts", "scripts/roadmap.mjs", "docs/x.md"]) assert.doesNotMatch(file, RISKY);
  });

  test("a commit marked Trial: unreviewed that touches a risky path is refused, and the land names the file", async () => {
    const file = ".github/workflows/ci.yml";
    const run = await repo(() => {}, async (b) => {
      mkdirSync(join(b, file, ".."), { recursive: true });
      writeFileSync(join(b, file), "changed\n");
      await git(b, "add", file);
      await git(b, "commit", "-qm", "tool\n\nTrial: unreviewed");
    }, { check: "exit 0", prepush: "exit 0" });
    await assertBack(run);
    assert.ok(run.r.stderr.includes(`land: ${file} is on the risky list, and a commit marked Trial: unreviewed changes it`), run.r.stderr);
    assert.equal(await originHead(run.main), "base");
  });

  test("the same risky change lands once its commit no longer carries the mark, and an unreviewed commit off the list lands too", async () => {
    const change = (file, message) => async (b) => {
      mkdirSync(join(b, file, ".."), { recursive: true });
      writeFileSync(join(b, file), "changed\n");
      await git(b, "add", file);
      await git(b, "commit", "-qm", message);
    };
    for (const onBranch of [change("scripts/check-repo.mjs", "tool"), change("scripts/arms.mjs", "arms\n\nTrial: unreviewed"), change("app/src/ui/a.ts", "ui\n\nTrial: unreviewed")]) {
      const run = await repo(() => {}, onBranch, { check: "exit 0", prepush: "exit 0" });
      assert.equal(run.r.status, 0, run.r.stderr);
      await landedHead(run);
    }
  });

  test("the mark is found however it is typed, and an odd file name on the risky list is still seen", async () => {
    for (const [file, mark] of [["scripts/heavy.mjs", "trial: Unreviewed"], ["scripts/heavy.mjs", "  Trial:  unreviewed"], ["app/src/server/æ.ts", "Trial: unreviewed"]]) {
      const run = await repo(() => {}, async (b) => {
        mkdirSync(join(b, file, ".."), { recursive: true });
        writeFileSync(join(b, file), "changed\n");
        await git(b, "add", file);
        await git(b, "commit", "-qm", `tool\n\n${mark}`);
      }, { check: "exit 0", prepush: "exit 0" });
      await assertBack(run);
      assert.ok(run.r.stderr.includes(`land: ${file} is on the risky list`), run.r.stderr);
      assert.equal(await originHead(run.main), "base");
    }
  });

  test("a marked risky commit that origin already holds does not stop a branch built on it, even when local main is behind", async () => {
    const run = await repo(() => {}, async (b) => {
      writeFileSync(join(b, "scripts/heavy.mjs"), "landed\n");
      await git(b, "add", "scripts/heavy.mjs");
      await git(b, "commit", "-qm", "heavy\n\nTrial: unreviewed");
      await write(b, "branch\n");
    }, { check: "exit 0", prepush: "exit 0", unpushed: (m) => git(m, "push", "-q", "origin", "feature~1:main", "feature~1:staging") });
    assert.equal(run.r.status, 0, run.r.stderr);
    await landedHead(run);
  });
});
