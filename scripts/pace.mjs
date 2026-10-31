#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { hygiene } from "./hygiene.mjs";
import { machine } from "./machine.mjs";

const GOAL = "task-42e5633d742184c5";
const LOG = "pace/snapshots.jsonl";
const MISSES = "pace/misses.jsonl";
const HARD_PATH = /^(app\/src\/(replica|sync|worker)|mac\/src|contracts)\//;
const STANDARD_PATH = /^(app\/(src|e2e)|mac\/e2e|scripts|fixtures|design)\//;
const HARD_TASK = /sync|merge|offline|conflict|replica|catch-up|cold boot|J10|mac shell|desktop|sign-in|\bAI\b|barkpark/i;
const STANDARD_TASK = /spike|judge|prototype|design|shell|find|organize|link|map|e2e/i;

const run = (cmd, args) => {
  try { return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 }); }
  catch { return null; }
};
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const count = (xs) => xs.reduce((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {});

const json = (out) => { try { return out === null ? null : JSON.parse(out); } catch { return null; } };

const snapshots = existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const flag = process.argv.indexOf("--since");
const asked = flag > 0 ? process.argv[flag + 1] : null;
const base = asked ? snapshots.filter((s) => Date.parse(s.at) <= Date.parse(asked)).at(-1) : snapshots.at(-1);
const since = base?.at ?? asked ?? new Date(Date.now() - 6 * 3600e3).toISOString();
const now = new Date().toISOString();

function range() {
  if (base?.head) {
    const from = run("git", ["rev-parse", "--verify", "--quiet", `${base.head}^{commit}`])?.trim();
    return from ? `${from}..main` : null;
  }
  const dates = run("git", ["log", "--first-parent", "--format=%cI", "main"]);
  return asked && dates !== null && dates.trim().split("\n").every((d) => Date.parse(d) >= Date.parse(asked)) ? "main" : null;
}

function commits() {
  const span = range();
  const out = span ? run("git", ["log", "--first-parent", span, "--format=%x1e%h%x1f%aI%x1f%s", "--numstat"]) : null;
  if (out === null) return null;
  return out.split("\x1e").filter((r) => r.trim()).map((rec) => {
    const [head, ...rest] = rec.trim().split("\n");
    const [sha, at, subject] = head.split("\x1f");
    const files = rest.filter(Boolean).map((l) => l.split("\t")).map(([a, d, path]) => ({ add: +a || 0, del: +d || 0, path }));
    const paths = files.map((f) => f.path);
    const tier = paths.some((p) => HARD_PATH.test(p)) ? "hard" : paths.some((p) => STANDARD_PATH.test(p)) ? "standard" : "light";
    return { sha, at, subject, tier, add: sum(files.map((f) => f.add)), del: sum(files.map((f) => f.del)) };
  });
}

function tasks(id) {
  const children = json(run("bp", ["task", "show", id, "-o", "json"]))?.children;
  if (!Array.isArray(children)) return null;
  const rows = [];
  for (const c of children) {
    const below = tasks(c.doc_id);
    if (below === null) return null;
    const tier = HARD_TASK.test(c.title) ? "hard" : STANDARD_TASK.test(c.title) ? "standard" : "light";
    rows.push({ id: c.doc_id, title: c.title, status: c.lifecycle_status, updated: c.updated_at, criteria: c.criteria_progress, tier }, ...below);
  }
  return rows;
}

function barkparkMerges() {
  const out = run("gh", ["pr", "list", "-R", "FRIKKern/barkpark", "--state", "merged", "--search", `barkever in:body merged:>=${since.slice(0, 10)}`,
    "--json", "number,title,mergedAt,additions,deletions", "--limit", "100"]);
  const merged = json(out);
  return Array.isArray(merged) ? merged.filter((p) => p.mergedAt >= since) : null;
}

const landed = commits();
const tree = tasks(GOAL);
const closed = tree?.filter((t) => t.status === "done" && t.updated >= since);
const h = hygiene();
const m = machine();
const top = (xs) => xs.slice(0, 20);
const misses = existsSync(MISSES) ? readFileSync(MISSES, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const missClasses = Object.entries(count(misses.map((x) => x.class))).sort((a, b) => b[1] - a[1]);
const seenMisses = base?.misses?.total;
const newMisses = Number.isInteger(seenMisses) && misses.length >= seenMisses ? misses.length - seenMisses : null;
const halfFixes = [...new Set(misses.filter((x) => / r[2-9]/.test(x.where) && misses.some((y) => y.class === x.class && y.where.split(" ")[0] === x.where.split(" ")[0] && y.where !== x.where)).map((x) => `${x.where.split(" ")[0]} ${x.class}`))];

const snap = {
  at: now,
  since,
  head: run("git", ["rev-parse", "--short", "main"])?.trim(),
  hours: +((Date.parse(now) - Date.parse(since)) / 3600e3).toFixed(2),
  commits: landed && {
    count: landed.length,
    byTier: count(landed.map((c) => c.tier)),
    add: sum(landed.map((c) => c.add)),
    del: sum(landed.map((c) => c.del)),
    journeys: [...new Set(landed.flatMap((c) => c.subject.match(/\bJ\d\d\b/g) ?? []))].sort(),
    list: landed.map((c) => `${c.sha} ${c.tier} ${c.subject}`),
  },
  tasks: tree && {
    total: tree.length,
    byStatus: count(tree.map((t) => t.status)),
    openByTier: count(tree.filter((t) => t.status !== "done" && t.status !== "cancelled").map((t) => t.tier)),
    closed: closed.map((t) => `${t.id} ${t.tier} ${t.title}`),
  },
  machine: m,
  misses: { total: misses.length, new: newMisses, byClass: Object.fromEntries(missClasses), halfFixes },
  barkpark: barkparkMerges(),
  hygiene: {
    size: h.size,
    counts: Object.fromEntries(["godFiles", "comments", "unusedExports", "patterns", "slop", "noPicture"].map((k) => [k, h[k].length])),
    godFiles: top(h.godFiles), comments: top(h.comments), unusedExports: top(h.unusedExports),
    patterns: top(h.patterns), slop: top(h.slop), noPicture: top(h.noPicture),
  },
};

if (process.argv.includes("--write")) {
  mkdirSync("pace", { recursive: true });
  appendFileSync(LOG, JSON.stringify(snap) + "\n");
}

const prev = snapshots.at(-1);
const row = (k, v, p) => console.log(`| ${k} | ${v} | ${p ?? "–"} |`);
const of = (section, f) => (section === null ? "unknown" : section === undefined ? undefined : f(section));
const tiers = (byTier) => ["hard", "standard", "light"].map((t) => byTier[t] ?? 0).join("/");
console.log(`pace ${since} → ${now} (${snap.hours} h, main ${snap.head})\n`);
if (asked && asked !== since) console.log(`--since ${asked} starts at the snapshot taken at ${since}: commits only have a known landing time from a snapshot head\n`);
console.log("| Metric | Now | Previous |\n|---|---|---|");
const both = (k, section, f) => row(k, of(snap[section], f), prev && of(prev[section], f));
both("commits", "commits", (c) => c.count);
both("commits hard/standard/light", "commits", (c) => tiers(c.byTier));
both("lines +/−", "commits", (c) => `${c.add}/${c.del}`);
both("journeys touched", "commits", (c) => c.journeys.join(" ") || "–");
both("tasks closed", "tasks", (t) => t.closed.length);
both("tasks open hard/standard/light", "tasks", (t) => tiers(t.openByTier));
row("load per core (5 min)", m.loadPerCore, prev?.machine?.loadPerCore);
row("swap used %", m.swapUsedPct, prev?.machine?.swapUsedPct);
row("compute bound", m.computeBound ? "YES" : "no", prev?.machine && (prev.machine.computeBound ? "YES" : "no"));
row("stray processes", m.strays.length, prev?.machine?.strays.length);
row("heavy runs waited s (last 50)", sum(m.heavyRuns.map((r) => r.waitedS)), prev?.machine && sum(prev.machine.heavyRuns.map((r) => r.waitedS)));
both("barkpark PRs merged", "barkpark", (b) => b.length);
both("review misses (new / total)", "misses", (x) => `${x.new ?? "unknown"} / ${x.total}`);
row("repeated miss classes", missClasses.filter(([, n]) => n > 1).map(([c, n]) => `${c} ${n}`).join(", ") || "–", prev?.misses && Object.entries(prev.misses.byClass).filter(([, n]) => n > 1).map(([c, n]) => `${c} ${n}`).join(", "));
row("half fixes (same class again next round)", halfFixes.join(", ") || "–", prev?.misses?.halfFixes.join(", "));
for (const [k, v] of Object.entries(snap.hygiene.counts)) row(k, v, prev?.hygiene.counts[k]);
if (!process.argv.includes("--write")) console.log("\n(dry run: add --write to append to pace/snapshots.jsonl)");
