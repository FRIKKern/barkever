#!/usr/bin/env node
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { HEAVY_DIR } from "./machine.mjs";

const SLOTS = Number(process.env.HEAVY_SLOTS ?? 2);
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error("usage: node scripts/heavy.mjs <command> [args…]"); process.exit(2); }

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function take() {
  for (let i = 0; i < SLOTS; i++) {
    const slot = `${HEAVY_DIR}/slot-${i}`;
    try { writeFileSync(slot, String(process.pid), { flag: "wx" }); return slot; }
    catch {
      let holder = NaN;
      try { holder = Number(readFileSync(slot, "utf8")); } catch { continue; }
      if (!alive(holder)) { try { unlinkSync(slot); } catch {} i -= 1; }
    }
  }
  return null;
}

mkdirSync(HEAVY_DIR, { recursive: true });
const asked = Date.now();
let slot = take();
if (!slot) console.error(`heavy: all ${SLOTS} slots busy, waiting`);
while (!slot) { await sleep(2000); slot = take(); }
const started = Date.now();
const release = () => { try { if (Number(readFileSync(slot, "utf8")) === process.pid) unlinkSync(slot); } catch {} };

const child = spawn(cmd, args, { stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code, signal) => {
  release();
  const record = { at: new Date().toISOString(), cwd: process.cwd(), cmd: [cmd, ...args].join(" "), waitedS: Math.round((started - asked) / 1000), ranS: Math.round((Date.now() - started) / 1000), code: code ?? signal };
  appendFileSync(`${HEAVY_DIR}/runs.jsonl`, JSON.stringify(record) + "\n");
  process.exit(code ?? 1);
});
