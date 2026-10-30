#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const [branch, ...rest] = process.argv.slice(2);
const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : null);
const trail = flag("--trail");
const reviewed = flag("--reviewed");
if (!branch || branch === "main") { console.error("usage: node scripts/land.mjs <branch> --reviewed <sha> [--trail <n>]"); process.exit(2); }

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const step = (label, cmd, args, cwd) => {
  console.error(`land: ${label}`);
  try { execFileSync(cmd, args, { cwd, stdio: "inherit" }); }
  catch { console.error(`land: ${label} failed; main is untouched`); process.exit(1); }
};

const here = git(["rev-parse", "--show-toplevel"]);
const dir = execFileSync("node", [`${here}/scripts/worktree.mjs`, branch], { encoding: "utf8" }).trim().split("\n").at(-1);
const main = git(["worktree", "list", "--porcelain"]).match(/^worktree (.+)$/m)[1];
for (const [where, cwd] of [["branch", dir], ["main checkout", main]]) {
  if (git(["status", "--porcelain", "--untracked-files=no"], cwd)) { console.error(`land: uncommitted changes in the ${where} (${cwd})`); process.exit(1); }
}

const touched = git(["diff", "--name-only", `main...${branch}`], dir).split("\n").filter(Boolean);
const isText = (files) => files.length > 0 && files.every((f) => /^(docs|pace|\.claude\/skills)\/|^[A-Z]+\.md$/.test(f));
const head = git(["rev-parse", branch], dir);
const samePatch = (sha) => { try { const patch = git(["diff", `main...${branch}`], dir); return patch !== "" && git(["diff", `main...${sha}`], dir) === patch; } catch { return false; } };
if (!isText(touched) && !(reviewed && reviewed.length >= 7 && (head.startsWith(reviewed) || samePatch(reviewed)))) {
  console.error(`land: ${branch} is at ${head.slice(0, 10)}; pass --reviewed <the sha the reviewer passed>. A head that moved after review needs a delta review first`);
  process.exit(1);
}

step("bring main up to origin", "git", ["pull", "--rebase", "-q", "origin", "main"], main);
step("rebase onto main", "git", ["rebase", "-q", "--rebase-merges", "main"], dir);
step("npm run check", "npm", ["run", "check"], dir);
if (isText(git(["diff", "--name-only", `main...${branch}`], dir).split("\n").filter(Boolean))) step("text-only change: checkpoint secret scan", "node", ["scripts/scan-outgoing.mjs"], dir);
else step("prepush (queued)", "node", [`${main}/scripts/heavy.mjs`, "npm", "run", "prepush"], dir);
step("push the branch", "git", ["push", "-q", "origin", branch], dir);
if (trail) step(`link to trail ${trail}`, "entire", ["trail", "link", trail, "--branch", branch], dir);
step("fast-forward main", "git", ["merge", "--ff-only", "-q", branch], main);
step("push main", "git", ["push", "-q", "origin", "main"], main);
console.log(`landed ${branch} on main at ${git(["rev-parse", "--short", "main"], main)}`);
