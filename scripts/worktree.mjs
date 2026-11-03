#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";

const name = process.argv[2];
if (!name) { console.error("usage: node scripts/worktree.mjs <branch>"); process.exit(2); }

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const trees = git(["worktree", "list", "--porcelain"]).split("\n\n").map((b) => ({
  dir: b.match(/^worktree (.+)$/m)?.[1],
  branch: b.match(/^branch refs\/heads\/(.+)$/m)?.[1],
}));
const main = trees[0].dir;
const dir = trees.find((t) => t.branch === name)?.dir ?? resolve(main, "..", "barkever-wt", name);

const commonDir = (cwd) => { try { return git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd); } catch { return null; } };
if (existsSync(dir) && commonDir(dir) !== commonDir(main)) { console.error(`worktree: ${dir} is not a worktree of this repo; move it away first`); process.exit(1); }
if (!existsSync(dir)) {
  const known = execFileSync("git", ["branch", "--list", name], { cwd: main, encoding: "utf8" }).trim();
  execFileSync("git", ["worktree", "add", "-q", dir, ...(known ? [name] : ["-b", name, "main"])], { cwd: main, stdio: "inherit" });
}
if (!existsSync(resolve(dir, "node_modules"))) execFileSync("pnpm", ["install", "--frozen-lockfile", "--prefer-offline", "--silent"], { cwd: dir, stdio: "inherit" });
const env = resolve(dir, "app/.env.local");
if (!existsSync(env) && existsSync(resolve(main, "app/.env.local"))) symlinkSync(resolve(main, "app/.env.local"), env);
console.log(dir);
