#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { PACK_DIR, REPORT, compare, decide, readSourceNote, sourceDir } from "./pack.mjs";

const GATES = {
  "pack-compare": [process.execPath, ["scripts/pack-compare.mjs"]],
  types: ["pnpm", ["--filter", "@barkever/app", "exec", "tsc", "--noEmit"]],
  "conformance-test": [process.execPath, ["--test", "--test-timeout=300000", "conformance/conformance.test.mjs"]],
};

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
  for (const dir of ["node_modules", "app/node_modules"]) if (existsSync(join(root, dir)) && !existsSync(join(work, dir))) symlinkSync(join(root, dir), join(work, dir));
  const sync = spawnSync(process.execPath, ["scripts/pack-sync.mjs", checkout, "--commit", source], { cwd: work, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  if (sync.status !== 0) {
    say("pack-plan: pack-sync failed (see above); nothing to push");
    process.exit(1);
  }
  const moved = [...sync.stdout.matchAll(/^moved: (.+)$/gm)].map((m) => ({ type: m[1], line: `row ${m[1]} moved` }));
  const failed = [];
  for (const [name, [command, args]] of Object.entries(GATES)) {
    const { NODE_TEST_CONTEXT, ...env } = process.env;
    const r = spawnSync(command, args, { cwd: work, env, encoding: "utf8" });
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
