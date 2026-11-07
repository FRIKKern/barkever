#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HEAVY_DIR = process.env.HEAVY_DIR ?? join(homedir(), ".cache", "heavy-slots");

const slots = process.env.HEAVY_SLOTS ?? "3";
if (!/^[1-9]\d?$/.test(slots)) { console.error(`heavy: HEAVY_SLOTS needs a whole number from 1 to 99, got ${JSON.stringify(slots)}`); process.exit(2); }
const SLOTS = Number(slots);
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error("usage: node scripts/heavy.mjs <command> [args…]"); process.exit(2); }
const PREPUSH = /\bheavy\.mjs npm run prepush$/;
const lander = PREPUSH.test(process.argv.slice(1).join(" "));

const ifPresent = (use) => { try { return use(); } catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; } };
const signals = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const alive = (h) => (h.pid > 0 ? signals(h.pid) : Date.now() - Number(h.at / 1000000n) < 5000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const owner = process.env.HEAVY_OWNER ?? execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const slotPath = (i) => `${HEAVY_DIR}/slot-${i}`;
const wantPath = `${HEAVY_DIR}/want-${process.pid}`;

function holder(slot) {
  try {
    const [pid, ...rest] = readFileSync(slot, "utf8").split(" ");
    return { pid: Number(pid), owner: rest.join(" "), at: statSync(slot, { bigint: true }).birthtimeNs };
  } catch { return null; }
}

const command = (pid) => { try { return execFileSync("ps", ["-ww", "-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim(); } catch { return ""; } };

const held = () => Array.from({ length: SLOTS }, (_, i) => holder(slotPath(i))).filter((h) => h && h.pid !== process.pid && alive(h));
const before = (me) => (h) => h.at < me.at;

function room(live) {
  const landers = live.filter((h) => PREPUSH.test(command(h.pid))).length;
  return landers ? Math.min(SLOTS - live.length, 1 - (live.length - landers)) : SLOTS - live.length;
}

const crowded = (live, queue = 0) => live.some((h) => h.owner === owner) || (!lander && room(live) <= queue);

function waiting() {
  const names = ifPresent(() => readdirSync(HEAVY_DIR)) ?? [];
  return names.flatMap((name) => {
    const pid = Number(name.match(/^want-(\d+)$/)?.[1]);
    if (!pid || pid === process.pid) return [];
    if (!signals(pid)) { ifPresent(() => unlinkSync(`${HEAVY_DIR}/${name}`)); return []; }
    if (!/\bheavy\.mjs\b/.test(command(pid))) return [];
    try { return [{ owner: readFileSync(`${HEAVY_DIR}/${name}`, "utf8"), at: statSync(`${HEAVY_DIR}/${name}`, { bigint: true }).birthtimeNs }]; } catch { return []; }
  });
}

const ahead = (live) => waiting().filter((w) => w.at < born && !live.some((h) => h.owner === w.owner)).length;

function want() {
  rmSync(wantPath, { force: true });
  writeFileSync(wantPath, owner);
  return statSync(wantPath, { bigint: true }).birthtimeNs;
}

function take() {
  const live = held();
  if (crowded(live, ahead(live))) return null;
  for (let i = 0; i < SLOTS; i++) {
    const slot = slotPath(i);
    try { writeFileSync(slot, `${process.pid} ${owner}`, { flag: "wx" }); }
    catch {
      const h = holder(slot);
      if (h && !alive(h)) { ifPresent(() => unlinkSync(slot)); i -= 1; }
      continue;
    }
    const me = holder(slot);
    const mine = () => holder(slot)?.pid === process.pid;
    if (me && !crowded(held().filter(before(me))) && mine()) return slot;
    if (mine()) ifPresent(() => unlinkSync(slot));
    return null;
  }
  return null;
}

mkdirSync(HEAVY_DIR, { recursive: true });
let child;
process.on("exit", () => { try { rmSync(wantPath, { force: true }); } catch (e) { if (e.code !== "ENOTDIR") throw e; } });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (child ? child.kill(sig) : process.exit(sig === "SIGINT" ? 130 : 143)));
const asked = Date.now();
const dirGone = () => { console.error(`heavy: ${HEAVY_DIR} is gone; not waiting for a slot that cannot be written`); process.exit(1); };
const dirThere = () => statSync(HEAVY_DIR, { throwIfNoEntry: false })?.isDirectory();
const orGone = (step) => { try { return step(); } catch (e) { if (dirThere() || !["ENOENT", "ENOTDIR"].includes(e.code)) throw e; dirGone(); } };
const born = orGone(want);
let slot = orGone(take);
if (!slot) console.error(`heavy: waiting (one slot per worktree, ${SLOTS} in all)`);
while (!slot) {
  await sleep(2000);
  if (!dirThere()) dirGone();
  slot = orGone(take);
}
rmSync(wantPath, { force: true });
const started = Date.now();
const release = () => { if (holder(slot)?.pid === process.pid) ifPresent(() => unlinkSync(slot)); };

child = spawn(cmd, args, { stdio: "inherit" });
child.on("exit", (code, signal) => {
  release();
  const record = { at: new Date().toISOString(), cwd: process.cwd(), cmd: [cmd, ...args].join(" "), waitedS: Math.round((started - asked) / 1000), ranS: Math.round((Date.now() - started) / 1000), code: code ?? signal };
  ifPresent(() => appendFileSync(`${HEAVY_DIR}/runs.jsonl`, JSON.stringify(record) + "\n"));
  process.exit(code ?? 1);
});
