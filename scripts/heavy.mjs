#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { HEAVY_DIR } from "./machine.mjs";

const SLOTS = Number(process.env.HEAVY_SLOTS ?? 3);
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error("usage: node scripts/heavy.mjs <command> [args…]"); process.exit(2); }

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const owner = process.env.HEAVY_OWNER ?? execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const slotPath = (i) => `${HEAVY_DIR}/slot-${i}`;

function holder(slot) {
  try {
    const [pid, ...rest] = readFileSync(slot, "utf8").split(" ");
    return { pid: Number(pid), owner: rest.join(" ") };
  } catch { return null; }
}

function ownerBusy() {
  for (let i = 0; i < SLOTS; i++) {
    const h = holder(slotPath(i));
    if (h && h.owner === owner && alive(h.pid)) return true;
  }
  return false;
}

function take() {
  if (ownerBusy()) return null;
  for (let i = 0; i < SLOTS; i++) {
    const slot = slotPath(i);
    try { writeFileSync(slot, `${process.pid} ${owner}`, { flag: "wx" }); return slot; }
    catch {
      const h = holder(slot);
      if (h && !alive(h.pid)) { try { unlinkSync(slot); } catch {} i -= 1; }
    }
  }
  return null;
}

mkdirSync(HEAVY_DIR, { recursive: true });
const asked = Date.now();
let slot = take();
if (!slot) console.error(`heavy: waiting (one slot per worktree, ${SLOTS} in all)`);
while (!slot) { await sleep(2000); slot = take(); }
const started = Date.now();
const release = () => { if (holder(slot)?.pid === process.pid) try { unlinkSync(slot); } catch {} };

const child = spawn(cmd, args, { stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => {
  release();
  const record = { at: new Date().toISOString(), cwd: process.cwd(), cmd: [cmd, ...args].join(" "), waitedS: Math.round((started - asked) / 1000), ranS: Math.round((Date.now() - started) / 1000), code: code ?? signal };
  appendFileSync(`${HEAVY_DIR}/runs.jsonl`, JSON.stringify(record) + "\n");
  process.exit(code ?? 1);
});
