#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const GOAL = "task-42e5633d742184c5";
const PROJECT = "et/frikkern";
const REPO = "https://entire.com/et/frikkern/barkever";
const DRY = process.argv.includes("--dry");
const JID = /\bJ\d\d\b/g;
const hasJ = (s) => /\bJ\d\d\b/.test(s);

const exec = promisify(execFile);
const run = async (cmd, args) => {
  try { return (await exec(cmd, args, { maxBuffer: 64 << 20 })).stdout; }
  catch { return null; }
};
const json = async (cmd, args) => JSON.parse((await run(cmd, args)) ?? "null");
const task = (id) => json("bp", ["task", "get", id, "-o", "json"]);
const entire = (...args) => json("entire", ["trail", ...args, "--json"]);
const journeysIn = (value) => [...new Set(JSON.stringify(value ?? "").match(JID) ?? [])].sort();
const when = (ts) => ts.slice(5, 16).replace("T", " ");

function verdict(notes, j) {
  const near = new RegExp(`${j}\\W{1,3}(?:[\\w-]+\\W{1,3}){0,3}?(PASS|FAIL)`, "i");
  const said = ({ note, solo }) => note.match(near)?.[1] ?? (solo && !hasJ(note) ? [...note.matchAll(/\b(PASS|FAIL)\b/g)].at(-1)?.[1] : null);
  const last = notes.map((n) => ({ ...n, said: said(n)?.toUpperCase() })).filter((n) => n.said).sort((a, b) => a.ts.localeCompare(b.ts)).at(-1);
  return last ? `${last.said} · ${last.note.split(/[:.]/)[0].slice(0, 32)} (${when(last.ts)})` : "";
}

const attempts = (criteria, j, solo) => criteria
  .filter((c) => journeysIn(c.criterion).includes(j) || !hasJ(c.criterion))
  .flatMap((c) => (c.attempts ?? []).map((a) => ({ ...a, solo })));

async function building() {
  const tree = (await run("git", ["worktree", "list", "--porcelain"])) ?? "";
  const branches = [...tree.matchAll(/^branch refs\/heads\/(.+)$/gm)].map((m) => m[1]).filter((b) => b !== "main");
  const named = await Promise.all(branches.map(async (b) => ({ branch: b, js: journeysIn(`${b} ${await run("git", ["log", "--format=%s", `main..${b}`])}`) })));
  return named.filter((n) => n.js.length);
}

async function changesOf(trails) {
  const shown = await Promise.all(trails.map((t) => entire("show", String(t.number))));
  const changes = shown.flatMap((s) => s?.changes ?? []);
  return Promise.all(changes.map(async (c) => {
    const sel = `${c.repository}/${c.number}`;
    const [approvals, findings, subjects, onMain] = await Promise.all([
      entire("approvals", sel), entire("finding", sel),
      run("git", ["log", "-20", "--format=%s", `origin/${c.branch}`]),
      run("git", ["merge-base", "--is-ancestor", `origin/${c.branch}`, "main"]),
    ]);
    const open = findings?.counts?.Open ?? 0;
    const review = [approvals?.approvals?.length ? `✓ ${approvals.approvals.length} approval` : "", open ? `⚑ ${open} open (${findings.counts.OpenHigh} high)` : ""].filter(Boolean).join(" ");
    const state = onMain !== null ? "on main" : c.status;
    return { ...c, sel, review, js: journeysIn(`${c.branch} ${c.title} ${subjects ?? ""}`), link: `[${sel}](${c.url}) ${state}` };
  }));
}

const NAMES = Object.fromEntries([...readFileSync("JOURNEYS.md", "utf8").matchAll(/^\| (J\d\d) \| ([^|]+?) \|/gm)].map((m) => [m[1], m[2]]));
const MARK = { passed: "✅", review: "🔍", reviewed: "☑️", building: "🔨", todo: "⏳" };
const TASK = { done: "✅", in_progress: "🔨", open: "⏳" };
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function journey(m, j, kids, changes, live, mainLog, solo) {
  const passed = m.content.acceptance_criteria.some((c) => c.met && journeysIn(c.criterion).includes(j));
  const ks = kids.filter((k) => k.js.includes(j));
  const cs = changes.filter((c) => c.js.includes(j));
  const ls = live.filter((l) => l.js.includes(j));
  const notes = [...attempts(m.content.acceptance_criteria, j, solo), ...ks.flatMap((k) => attempts(k.content.acceptance_criteria ?? [], j, k.js.length === 1))];
  const review = verdict(notes, j);
  const state = passed ? "passed" : cs.some((c) => c.status === "open") ? "review" : ks.some((k) => k.lifecycle_status === "in_progress") || ls.length ? "building" : review.startsWith("PASS") ? "reviewed" : "todo";
  const onMain = mainLog.filter((s) => s.match(JID)?.includes(j)).length;
  const facts = [
    review && (review.startsWith("FAIL") ? `last review **FAIL**` : `last review PASS`),
    ...cs.map((c) => [c.link, c.review].filter(Boolean).join(" ")),
    ...ls.map((l) => `building on \`${l.branch}\``),
    onMain && `${plural(onMain, "commit")} on main`,
  ].filter(Boolean);
  return { state, line: `- ${MARK[state]} **${j} ${NAMES[j] ?? ""}** · ${state}${facts.length ? ` · ${facts.join(" · ")}` : ""}` };
}

function body(m, kids, changes, live, mainLog, number) {
  const js = journeysIn(m.content.acceptance_criteria.map((c) => c.criterion));
  const rows = js.map((j) => journey(m, j, kids, changes, live, mainLog, js.length === 1));
  const tally = Object.keys(MARK).map((s) => [s, rows.filter((r) => r.state === s).length]).filter(([, n]) => n);
  const done = kids.filter((k) => k.lifecycle_status === "done").length;
  const summary = js.length
    ? `**${rows.filter((r) => r.state === "passed").length} of ${plural(js.length, "journey")} passed**${tally.filter(([s]) => s !== "passed").map(([s, n]) => ` · ${n} ${s}`).join("")} · ${done}/${kids.length} tasks done`
    : `**${done} of ${plural(kids.length, "task")} done**`;
  const lines = [summary, ""];
  if (rows.length) lines.push("## Journeys", "", ...rows.map((r) => r.line), "");
  if (kids.length) lines.push("## Tasks", "", ...kids.map((k) => `- ${TASK[k.lifecycle_status] ?? "·"} ${k.title.split(":")[0].slice(0, 70)} · \`${k.doc_id}\``), "");
  lines.push(
    "---",
    "",
    `Milestone task \`${m.doc_id}\` · [repo](${REPO}) · link a branch: \`entire trail link ${number ?? "<n>"} --branch <name>\``,
    "",
    "_Written hourly by `scripts/milestones.mjs`; edits here are overwritten._",
  );
  return lines.join("\n");
}

const goal = await task(GOAL);
const [listed, live, log] = await Promise.all([
  json("entire", ["trail", "list", "--project", PROJECT, "--json", "--limit", "100"]),
  building(),
  run("git", ["log", "main", "--format=%s"]),
]);
const trails = listed?.items ?? [];
if (!goal || !listed) { console.error("milestones: cannot read Barkpark or Entire"); process.exit(1); }
const mainLog = (log ?? "").split("\n").filter(Boolean);
const marker = (id) => `Milestone task \`${id}\``;
const loose = trails.filter((t) => !t.body?.includes("Milestone task `") && hasJ(t.title));

for (const row of goal.children) {
  const { doc: m, children = [] } = await task(row.doc_id);
  const title = m.title.split(":")[0];
  const kids = await Promise.all(children.map(async (c) => {
    const d = (await task(c.doc_id))?.doc ?? c;
    return { ...d, js: journeysIn([d.title, d.content]) };
  }));
  const own = trails.find((t) => t.body?.includes(marker(m.doc_id))) ?? trails.find((t) => t.title === title);
  const mine = journeysIn(m.content.acceptance_criteria.map((c) => c.criterion));
  const related = loose.filter((t) => journeysIn(t.title).some((j) => mine.includes(j)));
  const changes = await changesOf([...(own ? [own] : []), ...related]);
  const text = body(m, kids, changes, live, mainLog, own?.number);
  const status = m.lifecycle_status === "done" ? "closed" : "open";
  if (DRY) { console.log(`\n=== ${title} → ${own ? `#${own.number}` : "new"} ${status}\n${text}`); continue; }
  if (!own) {
    const made = await entire("create", "--no-branch", "--title", title, "--type", "feature", "--status", status, "--idempotency-key", `milestone-${m.doc_id}`, "--body", text);
    console.log(made ? `created #${made.number} ${title} ${made.url}` : `failed to create ${title}`);
  } else if (own.body !== text || own.status !== status || own.title !== title) {
    const done = await entire("update", String(own.number), "--title", title, "--status", status, "--body", text);
    console.log(done ? `updated #${own.number} ${title}` : `failed to update #${own.number} ${title}`);
  } else console.log(`unchanged #${own.number} ${title}`);
}
