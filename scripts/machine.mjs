#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cpus, loadavg, totalmem } from "node:os";
import { pathToFileURL } from "node:url";

export const HEAVY_DIR = process.env.HEAVY_DIR ?? "~/.cache/heavy-slots";

const BUCKETS = [
  ["claude", /\/claude\b/], ["chrome", /Chrom|chrome|headless_shell/], ["electron", /Electron/i],
  ["beam", /beam\.smp/], ["go", /\/go-build|golang\.org\/toolchain/], ["node", /\bnode\b/],
];
const run = (cmd, args) => { try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
const days = (etime) => (etime.includes("-") ? Number(etime.split("-")[0]) : 0);

export function machine() {
  const cores = cpus().length;
  const [load1, load5, load15] = loadavg().map((x) => +x.toFixed(1));
  const swap = run("sysctl", ["-n", "vm.swapusage"]).match(/total = ([\d.]+)M\s+used = ([\d.]+)M/);
  const freePct = Number(run("memory_pressure", []).match(/free percentage: (\d+)%/)?.[1] ?? NaN);
  const disk = run("df", ["-k", "~"]).trim().split("\n").at(-1)?.split(/\s+/);
  const procs = run("ps", ["-axo", "pid=,ppid=,pcpu=,rss=,etime=,command="]).trim().split("\n").map((l) => {
    const [pid, ppid, cpu, rss, etime, ...cmd] = l.trim().split(/\s+/);
    return { pid: +pid, ppid: +ppid, cpu: +cpu, rss: +rss, etime, cmd: cmd.join(" ") };
  });
  const byKind = Object.fromEntries(BUCKETS.map(([k]) => [k, { n: 0, cpu: 0, gb: 0 }]));
  for (const p of procs) {
    const kind = BUCKETS.find(([, re]) => re.test(p.cmd))?.[0];
    if (!kind) continue;
    byKind[kind].n += 1;
    byKind[kind].cpu += p.cpu;
    byKind[kind].gb += p.rss / 1048576;
  }
  for (const v of Object.values(byKind)) { v.cpu = Math.round(v.cpu); v.gb = +v.gb.toFixed(1); }
  const strays = procs
    .filter((p) => p.ppid === 1 && p.cpu > 20 && days(p.etime) >= 1 && /\/(var\/folders|tmp|dev-caches)\//.test(p.cmd))
    .map((p) => `${p.pid} ${p.cpu}% ${p.etime} ${p.cmd.slice(0, 120)}`);
  const parent = new Map(procs.map((p) => [p.pid, p.ppid]));
  const slotPids = new Set(existsSync(HEAVY_DIR) ? run("sh", ["-c", `cat ${HEAVY_DIR}/slot-* 2>/dev/null`]).split("\n").map((l) => +l.split(" ")[0]).filter(Boolean) : []);
  const inHeavy = (pid) => { for (let p = pid; p > 1; p = parent.get(p) ?? 1) if (slotPids.has(p)) return true; return false; };
  const burners = procs
    .filter((p) => /^(\S*\/)?yes$/.test(p.cmd) && !inHeavy(p.pid))
    .map((p) => `${p.pid} ${p.cpu}% ${p.etime} parent ${p.ppid}`);
  const runs = existsSync(`${HEAVY_DIR}/runs.jsonl`)
    ? readFileSync(`${HEAVY_DIR}/runs.jsonl`, "utf8").trim().split("\n").filter(Boolean).slice(-50).map((l) => JSON.parse(l))
    : [];
  const loadPerCore = +(load5 / cores).toFixed(2);
  const swapUsedPct = swap ? Math.round((100 * +swap[2]) / +swap[1]) : null;
  const bound = loadPerCore > 1.5 || freePct < 15;
  return {
    cores, memGb: Math.round(totalmem() / 2 ** 30), load1, load5, load15, loadPerCore,
    swapUsedPct, memFreePct: freePct, diskFreeGb: disk ? Math.round(+disk[3] / 1048576) : null,
    byKind, strays, burners, heavyRuns: runs, computeBound: bound,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(machine(), null, 2));
