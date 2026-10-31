#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { HEAVY_DIR } from "./machine.mjs";

const slots = process.env.HEAVY_SLOTS ?? "3";
if (!/^[1-9]\d?$/.test(slots)) { console.error(`heavy: HEAVY_SLOTS needs a whole number from 1 to 99, got ${JSON.stringify(slots)}`); process.exit(2); }
const SLOTS = Number(slots);
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error("usage: node scripts/heavy.mjs <command> [args…]"); process.exit(2); }
const PREPUSH = /\bheavy\.mjs npm run prepush$/;
const lander = PREPUSH.test(process.argv.slice(1).join(" "));

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const owner = process.env.HEAVY_OWNER ?? execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const slotPath = (i) => `${HEAVY_DIR}/slot-${i}`;

function holder(slot, i) {
  try {
    const [pid, ...rest] = readFileSync(slot, "utf8").split(" ");
    return { pid: Number(pid), owner: rest.join(" "), at: statSync(slot, { bigint: true }).birthtimeNs, i };
  } catch { return null; }
}

const command = (pid) => { try { return execFileSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim(); } catch { return ""; } };

const held = () => Array.from({ length: SLOTS }, (_, i) => holder(slotPath(i), i)).filter((h) => h && h.pid !== process.pid && alive(h.pid));
const before = (me) => (h) => h.at < me.at || (h.at === me.at && h.i < me.i);

function crowded(live) {
  if (live.some((h) => h.owner === owner)) return true;
  const landers = live.filter((h) => PREPUSH.test(command(h.pid))).length;
  return !lander && landers > 0 && live.length - landers >= 1;
}

function take() {
  if (crowded(held())) return null;
  for (let i = 0; i < SLOTS; i++) {
    const slot = slotPath(i);
    try { writeFileSync(slot, `${process.pid} ${owner}`, { flag: "wx" }); }
    catch {
      const h = holder(slot);
      if (h && !alive(h.pid)) { try { unlinkSync(slot); } catch {} i -= 1; }
      continue;
    }
    const me = holder(slot, i);
    if (me && !crowded(held().filter(before(me)))) return slot;
    try { unlinkSync(slot); } catch {}
    return null;
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
