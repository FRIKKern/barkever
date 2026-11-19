#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PACK_DIR, REPORT, compare, decide, packReaders, readSourceNote, sourceDir } from "./pack.mjs";

const CHECKS = {
  "check-repo": [process.execPath, ["scripts/check-repo.mjs"]],
  "pack-compare": [process.execPath, ["scripts/pack-compare.mjs"]],
  types: ["pnpm", ["--filter", "@barkever/app", "exec", "tsc", "--noEmit"]],
};
const INNER = "PACK_PLAN_INNER";
const gates = (work) => ({
  ...CHECKS,
  ...Object.fromEntries(
    packReaders(work)
      .filter((f) => !(process.env[INNER] && runsPlan(work, f)))
      .map((f) => [`test:${f}`, [process.execPath, ["--test", "--experimental-strip-types", "--no-warnings", "--test-timeout=300000", f]]]),
  ),
});
const runsPlan = (work, f) => readFileSync(join(work, f), "utf8").includes("pack-plan.mjs");

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: "string" }, summary: { type: "string" } } });
if (positionals.length !== 1 || !values.out) {
  console.error("usage: node scripts/pack-plan.mjs <barkpark checkout> --out <dir> [--summary <file>]");
  process.exit(2);
}
const root = fileURLToPath(new URL("..", import.meta.url));
const checkout = resolve(positionals[0]);
const out = resolve(values.out);
mkdirSync(out, { recursive: true });
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const say = (line) => {
  console.log(line);
  if (values.summary) appendFileSync(values.summary, `${line}\n`);
};
const plan = (p) => {
  writeFileSync(join(out, "plan.json"), `${JSON.stringify(p, null, 2)}\n`);
  say(`pack-plan: ${p.action}`);
  process.exit(0);
};

process.on("uncaughtException", (error) => {
  say(`pack-plan: stopped, nothing to push: ${error.message}`);
  process.exit(1);
});

const source = git(checkout, "rev-parse", "HEAD");
const held = readSourceNote(root).commit;
const contains = Boolean(held) && spawnSync("git", ["merge-base", "--is-ancestor", held, source], { cwd: checkout }).status === 0;
const lines = compare(root, sourceDir(checkout));
const first = decide({ lines, held, source, contains });
if (first.refuse) {
  say(`pack-plan: ${first.refuse}`);
  process.exit(1);
}
say(`pack-plan: Barkpark ${source.slice(0, 12)} against ${PACK_DIR} from ${held.slice(0, 12)}: ${first.why}`);
if (first.action === "none") plan({ action: "none" });

const head = git(root, "rev-parse", "HEAD");
const scratch = mkdtempSync(join(tmpdir(), "pack-plan-"));
const work = join(scratch, "tree");
git(root, "worktree", "add", "-q", "--detach", work, head);
let next;
try {
  for (const dir of ["node_modules", "app/node_modules", "mac/node_modules"]) if (existsSync(join(root, dir)) && !existsSync(join(work, dir))) symlinkSync(join(root, dir), join(work, dir));
  const sync = spawnSync(process.execPath, ["scripts/pack-sync.mjs", checkout, "--commit", source], { cwd: work, encoding: "utf8" });
  process.stderr.write(sync.stderr);
  if (sync.status !== 0) throw new Error(`pack-sync failed on the new pack:\n${`${sync.stdout}${sync.stderr}`.trim()}`);
  const moved = [...sync.stdout.matchAll(/^moved: (.+)$/gm)].map((m) => ({ type: m[1], line: `row ${m[1]} moved` }));
  const failed = [];
  if (process.env[INNER]) say("pack-plan: inside another plan's check, so tests that run the plan are left to that plan");
  for (const [name, [command, args]] of Object.entries(gates(work))) {
    const { NODE_TEST_CONTEXT, ...env } = process.env;
    const r = spawnSync(command, args, { cwd: work, env: { ...env, [INNER]: "1" }, encoding: "utf8" });
    if (r.status === 0) continue;
    failed.push(name);
    say(`pack-plan: ${name} fails on the new pack:\n${`${r.stdout}${r.stderr}`.trim()}`);
  }
  next = decide({ lines, held, source, contains, moved, failed });
  say(`pack-plan: ${next.why}`);
  if (next.action === "push") {
    git(work, "add", "-A", "--", PACK_DIR, REPORT);
    git(work, "-c", "user.name=pack-plan", "-c", "user.email=pack-plan@localhost", "commit", "-q", "-m", "sync");
    git(work, "bundle", "create", "-q", join(out, "sync.bundle"), "HEAD", `^${head}`);
  }
  next = { ...next, moved: moved.map((m) => m.type), failed };
} finally {
  git(root, "worktree", "remove", "--force", work);
  rmSync(scratch, { recursive: true, force: true });
}
plan({ action: next.action, source, ...(next.action === "report" ? { moved: next.moved, failed: next.failed } : {}) });
