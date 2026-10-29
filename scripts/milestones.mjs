#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const GOAL = "task-42e5633d742184c5";
const PROJECT = "et/frikkern";
const REPO = "https://entire.com/et/frikkern/barkever";
const DRY = process.argv.includes("--dry");
const JID = /\bJ\d\d\b/g;
const hasJ = (s) => /\bJ\d\d\b/.test(s);
const GLYPH = { done: "●", in_progress: "◐", open: "○" };

const exec = promisify(execFile);
const run = async (cmd, args) => {
  try { return (await exec(cmd, args, { maxBuffer: 64 << 20 })).stdout; }
  catch { return null; }
};
const json = async (cmd, args) => JSON.parse((await run(cmd, args)) ?? "null");
const task = (id) => json("bp", ["task", "get", id, "-o", "json"]);
const entire = (...args) => json("entire", ["trail", ...args, "--json"]);
const journeysIn = (value) => [...new Set(JSON.stringify(value ?? "").match(JID) ?? [])].sort();
const bar = (done, total, width = 20) => {
  const n = total ? Math.round((done / total) * width) : 0;
  return "▓".repeat(n) + "░".repeat(width - n);
};
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

function body(m, kids, changes, live, mainLog, number) {
  const js = journeysIn(m.content.acceptance_criteria.map((c) => c.criterion));
  const met = m.content.acceptance_criteria.filter((c) => c.met).length;
  const total = m.content.acceptance_criteria.length;
  const count = (s) => kids.filter((k) => k.lifecycle_status === s).length;
  const name = m.title.split(":")[0];
  const pad = Math.max(name.length, 8);
  const lines = [
    "```",
    `${name.padEnd(pad)}  ${bar(met, total)}  ${met}/${total} criteria`,
    ...(kids.length ? [`${"tasks".padEnd(pad)}  ${bar(count("done"), kids.length)}  ${count("done")}/${kids.length} done · ${count("in_progress")} building · ${count("open")} open`] : []),
    "```",
    "",
  ];
  if (js.length) {
    lines.push("| Journey | State | Change | Review | Tasks | On main |", "|---|---|---|---|---|---|");
    for (const j of js) {
      const passed = m.content.acceptance_criteria.some((c) => c.met && journeysIn(c.criterion).includes(j));
      const ks = kids.filter((k) => k.js.includes(j));
      const cs = changes.filter((c) => c.js.includes(j));
      const ls = live.filter((l) => l.js.includes(j));
      const change = [...cs.map((c) => c.link), ...ls.map((l) => `\`${l.branch}\` building`)].join("<br>") || "—";
      const notes = [...attempts(m.content.acceptance_criteria, j, js.length === 1), ...ks.flatMap((k) => attempts(k.content.acceptance_criteria ?? [], j, k.js.length === 1))];
      const review = verdict(notes, j);
      const state = passed ? "passed" : cs.some((c) => c.status === "open") ? "review" : ks.some((k) => k.lifecycle_status === "in_progress") || ls.length ? "building" : review.startsWith("PASS") ? "reviewed" : "todo";
      const tasks = ks.filter((k) => k.lifecycle_status !== "done");
      const shown = (tasks.length ? tasks : ks).slice(0, 3).map((k) => `${GLYPH[k.lifecycle_status] ?? "·"} \`${k.doc_id}\``).join("<br>") || "—";
      const onMain = mainLog.filter((s) => s.match(JID)?.includes(j)).length;
      lines.push(`| ${j} | ${state} | ${change} | ${[review, ...cs.map((c) => c.review)].filter(Boolean).join("<br>") || "—"} | ${shown} | ${onMain} |`);
    }
    lines.push("");
  }
  if (kids.length) {
    lines.push("| | Task | Journeys |", "|---|---|---|");
    for (const k of kids) lines.push(`| ${GLYPH[k.lifecycle_status] ?? "·"} | \`${k.doc_id}\` ${k.title.replace(/\|/g, "/").slice(0, 80)} | ${k.js.join(" ") || "—"} |`);
    lines.push("");
  }
  lines.push(
    `Milestone task \`${m.doc_id}\` (\`bp task show ${m.doc_id}\`) · goal \`${GOAL}\` · plan Paper \`/papers/barkever-plan\``,
    `[barkever](${REPO}) \`JOURNEYS.md\` · \`docs/decisions/\` · link a journey branch: \`entire trail link ${number ?? "<this number>"} --branch <branch>\``,
    "",
    "Written by `scripts/milestones.mjs` from Barkpark tasks and Entire changes. Edits here are overwritten.",
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
