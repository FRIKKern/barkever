#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { CONFORMANCE_FAILED, REPORT, compare, decide, packReaders, readSourceNote, sourceDir } from "./pack.mjs";
import { PACK_DIR } from "./pack-door.mjs";

export function defaultChecks(work) {
  return {
    "check-repo": [process.execPath, ["scripts/check-repo.mjs"]],
    "pack-compare": [process.execPath, ["scripts/pack-compare.mjs"]],
    types: ["pnpm", ["--filter", "@barkever/app", "exec", "tsc", "--noEmit"]],
    ...Object.fromEntries(packReaders(work).map((f) => [`test:${f}`, [process.execPath, ["--test", "--experimental-strip-types", "--no-warnings", "--test-timeout=300000", f]]])),
  };
}

const NESTED = "PACK_PLAN_CHECK";
const packSync = (work, checkout, source) => spawnSync(process.execPath, ["scripts/pack-sync.mjs", checkout, "--commit", source], { cwd: work, encoding: "utf8" });

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

export function planSync({ root, checkout, out, summary, checks = defaultChecks, sync: runSync = packSync }) {
  mkdirSync(out, { recursive: true });
  const say = (line) => {
    console.log(line);
    if (summary) appendFileSync(summary, `${line}\n`);
  };
  const done = (p) => {
    writeFileSync(join(out, "plan.json"), `${JSON.stringify(p, null, 2)}\n`);
    say(`pack-plan: ${p.action}`);
    return { status: 0, plan: p };
  };
  const stop = (why) => {
    say(`pack-plan: ${why}`);
    return { status: 1 };
  };

  if (process.env[NESTED] && checks === defaultChecks) return stop("refused: this plan runs inside another plan's check, and a plan never runs its own checks twice");
  const source = git(checkout, "rev-parse", "HEAD");
  const held = readSourceNote(root).commit;
  const contains = Boolean(held) && spawnSync("git", ["merge-base", "--is-ancestor", held, source], { cwd: checkout }).status === 0;
  const lines = compare(root, sourceDir(checkout));
  const first = decide({ lines, held, source, contains });
  if (first.refuse) return stop(first.refuse);
  say(`pack-plan: Barkpark ${source.slice(0, 12)} against ${PACK_DIR} from ${held.slice(0, 12)}: ${first.why}`);
  if (first.action === "none") return done({ action: "none" });

  const head = git(root, "rev-parse", "HEAD");
  const scratch = mkdtempSync(join(tmpdir(), "pack-plan-"));
  const work = join(scratch, "tree");
  git(root, "worktree", "add", "-q", "--detach", work, head);
  try {
    for (const dir of ["node_modules", "app/node_modules", "mac/node_modules"]) if (existsSync(join(root, dir)) && !existsSync(join(work, dir))) symlinkSync(join(root, dir), join(work, dir));
    const sync = runSync(work, checkout, source);
    process.stderr.write(sync.stderr ?? "");
    if (sync.status === CONFORMANCE_FAILED) {
      say(`pack-plan: conformance fails on the new pack:\n${`${sync.stdout ?? ""}${sync.stderr ?? ""}`.trim()}`);
      return done({ action: "report", source, moved: [], failed: ["conformance"] });
    }
    if (sync.status !== 0) return stop(`stopped, nothing to push: pack-sync failed on the new pack:\n${`${sync.stdout}${sync.stderr}`.trim()}`);
    const moved = [...sync.stdout.matchAll(/^moved: (.+)$/gm)].map((m) => ({ type: m[1], line: `row ${m[1]} moved` }));
    const failed = [];
    for (const [name, [command, args]] of Object.entries(checks(work))) {
      const { NODE_TEST_CONTEXT, ...env } = process.env;
      const r = spawnSync(command, args, { cwd: work, env: { ...env, [NESTED]: "1" }, encoding: "utf8" });
      if (r.status === 0) continue;
      failed.push(name);
      say(`pack-plan: ${name} fails on the new pack:\n${`${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? r.error.message : ""}`.trim()}`);
    }
    const next = decide({ lines, held, source, contains, moved, failed });
    say(`pack-plan: ${next.why}`);
    if (next.action === "push") {
      git(work, "add", "-A", "--", PACK_DIR, REPORT);
      git(work, "-c", "user.name=pack-plan", "-c", "user.email=pack-plan@localhost", "commit", "-q", "-m", "sync");
      git(work, "bundle", "create", "-q", join(out, "sync.bundle"), "HEAD", `^${head}`);
    }
    return done({ action: next.action, source, ...(next.action === "report" ? { moved: moved.map((m) => m.type), failed } : {}) });
  } catch (error) {
    return stop(`stopped, nothing to push: ${error.message}`);
  } finally {
    git(root, "worktree", "remove", "--force", work);
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: "string" }, summary: { type: "string" } } });
  if (positionals.length !== 1 || !values.out) {
    console.error("usage: node scripts/pack-plan.mjs <barkpark checkout> --out <dir> [--summary <file>]");
    process.exit(2);
  }
  const root = fileURLToPath(new URL("..", import.meta.url));
  process.exit(planSync({ root, checkout: resolve(positionals[0]), out: resolve(values.out), summary: values.summary }).status);
}
