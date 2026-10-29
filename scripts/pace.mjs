#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { hygiene } from "./hygiene.mjs";
import { machine } from "./machine.mjs";

const GOAL = "task-42e5633d742184c5";
const LOG = "pace/snapshots.jsonl";
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

const snapshots = existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
const flag = process.argv.indexOf("--since");
const since = flag > 0 ? process.argv[flag + 1] : snapshots.at(-1)?.at ?? new Date(Date.now() - 6 * 3600e3).toISOString();
const now = new Date().toISOString();

function commits() {
  const out = run("git", ["log", "main", `--since=${since}`, "--format=%x1e%h%x1f%aI%x1f%s", "--numstat"]) ?? "";
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
  const shown = JSON.parse(run("bp", ["task", "show", id, "-o", "json"]) ?? "null");
  return (shown?.children ?? []).flatMap((c) => {
    const tier = HARD_TASK.test(c.title) ? "hard" : STANDARD_TASK.test(c.title) ? "standard" : "light";
    const row = { id: c.doc_id, title: c.title, status: c.lifecycle_status, updated: c.updated_at, criteria: c.criteria_progress, tier };
    return [row, ...tasks(c.doc_id)];
  });
}

function barkparkMerges() {
  const out = run("gh", ["pr", "list", "-R", "FRIKKern/barkpark", "--state", "merged", "--search", `barkever in:body merged:>=${since.slice(0, 10)}`,
    "--json", "number,title,mergedAt,additions,deletions", "--limit", "100"]);
  return JSON.parse(out ?? "[]").filter((p) => p.mergedAt >= since);
}

const landed = commits();
const tree = tasks(GOAL);
const closed = tree.filter((t) => t.status === "done" && t.updated >= since);
const h = hygiene();
const m = machine();
const top = (xs) => xs.slice(0, 20);

const snap = {
  at: now,
  since,
  head: run("git", ["rev-parse", "--short", "main"])?.trim(),
  hours: +((Date.parse(now) - Date.parse(since)) / 3600e3).toFixed(2),
  commits: {
    count: landed.length,
    byTier: count(landed.map((c) => c.tier)),
    add: sum(landed.map((c) => c.add)),
    del: sum(landed.map((c) => c.del)),
    journeys: [...new Set(landed.flatMap((c) => c.subject.match(/\bJ\d\d\b/g) ?? []))].sort(),
    list: landed.map((c) => `${c.sha} ${c.tier} ${c.subject}`),
  },
  tasks: {
    total: tree.length,
    byStatus: count(tree.map((t) => t.status)),
    openByTier: count(tree.filter((t) => t.status !== "done" && t.status !== "cancelled").map((t) => t.tier)),
    closed: closed.map((t) => `${t.id} ${t.tier} ${t.title}`),
  },
  machine: m,
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
console.log(`pace ${since} → ${now} (${snap.hours} h, main ${snap.head})\n`);
console.log("| Metric | Now | Previous |\n|---|---|---|");
row("commits", snap.commits.count, prev?.commits.count);
row("commits hard/standard/light", ["hard", "standard", "light"].map((t) => snap.commits.byTier[t] ?? 0).join("/"),
  prev && ["hard", "standard", "light"].map((t) => prev.commits.byTier[t] ?? 0).join("/"));
row("lines +/−", `${snap.commits.add}/${snap.commits.del}`, prev && `${prev.commits.add}/${prev.commits.del}`);
row("journeys touched", snap.commits.journeys.join(" ") || "–", prev?.commits.journeys.join(" "));
row("tasks closed", snap.tasks.closed.length, prev?.tasks.closed.length);
row("tasks open hard/standard/light", ["hard", "standard", "light"].map((t) => snap.tasks.openByTier[t] ?? 0).join("/"),
  prev && ["hard", "standard", "light"].map((t) => prev.tasks.openByTier[t] ?? 0).join("/"));
row("load per core (5 min)", m.loadPerCore, prev?.machine?.loadPerCore);
row("swap used %", m.swapUsedPct, prev?.machine?.swapUsedPct);
row("compute bound", m.computeBound ? "YES" : "no", prev?.machine && (prev.machine.computeBound ? "YES" : "no"));
row("stray processes", m.strays.length, prev?.machine?.strays.length);
row("heavy runs waited s (last 50)", sum(m.heavyRuns.map((r) => r.waitedS)), prev?.machine && sum(prev.machine.heavyRuns.map((r) => r.waitedS)));
row("barkpark PRs merged", snap.barkpark.length, prev?.barkpark.length);
for (const [k, v] of Object.entries(snap.hygiene.counts)) row(k, v, prev?.hygiene.counts[k]);
if (!process.argv.includes("--write")) console.log("\n(dry run: add --write to append to pace/snapshots.jsonl)");
