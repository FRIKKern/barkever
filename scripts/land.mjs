#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [branch, ...rest] = process.argv.slice(2);
const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : null);
const reviewed = flag("--reviewed");
if (!branch || branch === "main") { console.error("usage: node scripts/land.mjs <branch> --reviewed <sha>"); process.exit(2); }

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const step = (label, cmd, args, cwd, undo = () => "", state = "main is untouched") => {
  console.error(`land: ${label}`);
  try { execFileSync(cmd, args, { cwd, stdio: "inherit" }); }
  catch { console.error(`land: ${label} failed${undo()}; ${state}`); process.exit(1); }
};

const here = git(["rev-parse", "--show-toplevel"]);
const dir = execFileSync("node", [`${here}/scripts/worktree.mjs`, branch, "--reuse"], { encoding: "utf8" }).trim().split("\n").at(-1);
const main = git(["worktree", "list", "--porcelain"]).match(/^worktree (.+)$/m)[1];
for (const name of [branch, "main"]) {
  if (git(["tag", "--list", name], main)) { console.error(`land: a tag named ${name} would stand in for the branch, and the land could push the wrong commit; rename the tag; nothing changed`); process.exit(1); }
}
const unfinished = (cwd) => ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG", "sequencer"].find((f) => existsSync(resolve(cwd, git(["rev-parse", "--git-path", f], cwd))));
const stopIfUnfinished = (where, cwd) => {
  const state = unfinished(cwd);
  if (state) { console.error(`land: the ${where} (${cwd}) has an unfinished ${state}; finish or abort it; nothing landed`); process.exit(1); }
};
for (const [where, cwd, name] of [["branch", dir, branch], ["main checkout", main, "main"]]) {
  stopIfUnfinished(where, cwd);
  const on = git(["branch", "--show-current"], cwd);
  if (on !== name) { console.error(`land: the ${where} (${cwd}) is on ${on || "no branch"}, not ${name}; nothing changed`); process.exit(1); }
  if (git(["status", "--porcelain", "--untracked-files=no"], cwd)) { console.error(`land: uncommitted changes in the ${where} (${cwd})`); process.exit(1); }
}
const strays = git(["ls-files", "--others", "--exclude-standard"], dir);
if (strays) { console.error(`land: untracked files in the branch (${dir}); the check would pass on what main won't get. Commit or move them; nothing changed:\n${strays}`); process.exit(1); }

const changedSince = (base) => git(["diff", "--name-only", "--no-renames", `${base}...${branch}`], dir).split("\n").filter(Boolean);
const touched = changedSince("main");
const only = (pattern) => (files) => files.length > 0 && files.every((f) => pattern.test(f));
const isText = only(/^docs\/|^[A-Z]+\.md$/);
const noAppEffect = only(/^docs\/|^[A-Z]+\.md$|^scripts\/arms\.mjs$/);
const head = git(["rev-parse", branch], dir);
const samePatch = (sha) => {
  try {
    const bases = git(["merge-base", "--all", "main", branch], dir).split("\n");
    if (bases.length !== 1) return false;
    const [base] = bases;
    const tree = git(["rev-parse", `${branch}^{tree}`], dir);
    return tree !== git(["rev-parse", `${base}^{tree}`], dir) && git(["merge-tree", "--write-tree", sha, base], dir) === tree;
  } catch { return false; }
};
if (!isText(touched) && !(reviewed && /^[0-9a-f]{7,40}$/.test(reviewed) && (head.startsWith(reviewed) || samePatch(reviewed)))) {
  console.error(`land: ${branch} is at ${head.slice(0, 10)}; pass --reviewed <the sha the reviewer passed>. A head that moved after review needs a delta review first`);
  process.exit(1);
}

const landMark = `${main}/.git/land.pid`;
const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; } };
const holder = existsSync(landMark) ? Number(readFileSync(landMark, "utf8")) : 0;
if (holder && isAlive(holder)) { console.error(`land: another land is running (pid ${holder}, ${landMark}); nothing changed`); process.exit(1); }
writeFileSync(landMark, String(process.pid));
process.on("exit", () => rmSync(landMark, { force: true }));

step("bring main up to origin", "git", ["pull", "--rebase", "-q", "origin", "main"], main);
const abortRebase = () => {
  if (!existsSync(resolve(dir, git(["rev-parse", "--git-path", "rebase-merge"], dir)))) return "";
  const conflicts = git(["diff", "--name-only", "--diff-filter=U"], dir).replaceAll("\n", ", ");
  git(["rebase", "--abort"], dir);
  return ` on ${conflicts}; rebase aborted, ${branch} is back at ${head.slice(0, 10)}`;
};
if (git(["rev-parse", branch], dir) !== head) { console.error(`land: ${branch} moved before the rebase; nothing landed; main is untouched`); process.exit(1); }
stopIfUnfinished("branch", dir);
step("rebase onto main", "git", ["rebase", "-q", "--rebase-merges", "main"], dir, abortRebase);
const rebased = git(["rev-parse", branch], dir);
const putBack = () => {
  try {
    const untouched = git(["rev-parse", "--abbrev-ref", "HEAD"], dir) === branch && git(["rev-parse", branch], dir) === rebased && !git(["status", "--porcelain", "--untracked-files=no"], dir);
    if (!untouched) return `; ${dir} changed during the land, so it stays as it is and ${branch} was not put back`;
    git(["reset", "-q", "--keep", head], dir);
    return `; ${branch} is back at ${head.slice(0, 10)}`;
  } catch { return `; ${branch} could not be put back and stays at ${rebased.slice(0, 10)}`; }
};
if (existsSync(resolve(dir, "pnpm-lock.yaml"))) step("install what main now locks", "pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], dir, putBack);
step("npm run check", "npm", ["run", "check"], dir, putBack);
if (noAppEffect(changedSince("origin/main"))) step("no app effect: secret scan", "node", ["scripts/scan-outgoing.mjs"], dir, putBack);
else step("prepush (queued)", "node", [`${main}/scripts/heavy.mjs`, "npm", "run", "prepush"], dir, putBack);
const moved = () => { try { return git(["rev-parse", "--abbrev-ref", "HEAD"], dir) !== branch || git(["rev-parse", branch], dir) !== rebased || git(["status", "--porcelain", "--untracked-files=no"], dir) !== ""; } catch { return true; } };
if (moved()) { console.error(`land: ${dir} moved during the land, so the checks did not cover what is there now; it stays as it is; nothing landed; main is untouched`); process.exit(1); }
step("fast-forward main", "git", ["merge", "--ff-only", "-q", rebased], main, putBack);
step("push main", "git", ["push", "-q", "origin", "main"], main, undefined, "local main is ahead of origin; origin is untouched");
console.log(`landed ${branch} on main at ${git(["rev-parse", "--short", "main"], main)}`);
const publishRoadmap = `${main}/scripts/roadmap.mjs`;
if (existsSync(publishRoadmap)) {
  try { execFileSync("node", [publishRoadmap, "--publish"], { cwd: main, stdio: "inherit", timeout: 600_000 }); }
  catch { console.error("land: the land is done, but the roadmap did not refresh; run npm run roadmap:publish"); }
}
