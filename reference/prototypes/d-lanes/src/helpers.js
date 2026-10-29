const ic = {
  home: '<svg class="i" viewBox="0 0 16 16"><path d="M2.5 4h11M2.5 8h7M2.5 12h4"/></svg>',
  board: '<svg class="i" viewBox="0 0 16 16"><rect x="2" y="2.5" width="3.2" height="11" rx="1"/><rect x="6.4" y="2.5" width="3.2" height="7" rx="1"/><rect x="10.8" y="2.5" width="3.2" height="9" rx="1"/></svg>',
  notes: '<svg class="i" viewBox="0 0 16 16"><path d="M4 1.8h5.5L12.5 5v9.2H4z"/><path d="M6.2 8h4M6.2 10.6h4"/></svg>',
  book: '<svg class="i" viewBox="0 0 16 16"><path d="M3.5 2.5h8.5v11H3.5z"/><path d="M5.8 2.5v11"/></svg>',
  inbox: '<svg class="i" viewBox="0 0 16 16"><path d="M2.5 9l1.8-6h7.4l1.8 6v4.5h-11z"/><path d="M2.5 9h3.2l.8 1.6h3l.8-1.6h3.2"/></svg>',
  back: '<svg class="i" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5"/></svg>',
  close: '<svg class="i" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  spark: '<span aria-hidden="true">✨</span>',
};
function hl(s) {
  const e = esc(s);
  if (!S.q) return e;
  const q = S.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return q ? e.replace(new RegExp(`(${q})`, "ig"), "<mark>$1</mark>") : e;
}
const matchQ = (n, extra = "") => !S.q || (n.title + " " + plain(n) + " " + extra).toLowerCase().includes(S.q.trim().toLowerCase());
function ctxNotes(ctx = S.ctx) {
  let list = D.notes;
  if (ctx.kind === "nb") list = list.filter((n) => n.nb === ctx.id || nbById[n.nb].parent === ctx.id);
  if (ctx.kind === "project") list = list.filter((n) => n.project === ctx.id);
  return list.filter((n) => matchQ(n)).slice().sort((a, b) => b.edited - a.edited);
}
const ctxName = (ctx) => ctx.kind === "all" ? "All notes" : ctx.kind === "project" ? prById[ctx.id].name : nbById[ctx.id].name;
function projectStats(pid) {
  const ts = tasks().filter((t) => t.n.project === pid);
  const c = { done: 0, today: 0, week: 0, later: 0 };
  ts.forEach((t) => c[boardCol(t)]++);
  const open = ts.filter((t) => !t.it.checked).sort((a, b) => (a.it.due ?? 999) - (b.it.due ?? 999));
  return { total: ts.length, ...c, next: open[0], notes: D.notes.filter((n) => n.project === pid).length };
}
function pbar(st, pc) {
  if (!st.total) return `<div class="pbar pc${pc}"></div>`;
  const w = (n) => `${(n / st.total) * 100}%`;
  return `<div class="pbar pc${pc}"><i class="s-done" style="width:${w(st.done)}"></i><i class="s-today" style="width:${w(st.today)}"></i><i class="s-week" style="width:${w(st.week)}"></i><i class="s-later" style="width:${w(st.later)}"></i></div>`;
}

function taskRow(t, { meta = "due", cls = "" } = {}) {
  const p = projOf(t.n), d = t.it.due;
  let m = "";
  if (t.it.checked) m = t.it.done != null ? dueLabel(t.it.done).replace("late", "ago") : "";
  else if (meta === "due") m = d != null && d !== 0 ? dueLabel(d) : "";
  else if (meta === "late" && d != null && d < 0) m = dueLabel(d);
  const late = !t.it.checked && d != null && d < 0;
  return `<div class="row task ${t.it.checked ? "done" : ""} ${cls}" data-open="${t.n.id}" data-line="${t.key}">
    <button class="cb ${t.it.checked ? "on" : ""}" data-tick="${t.key}" aria-label="Done"></button>
    <div class="row-main"><div class="row-t">${hl(t.text)}</div><div class="row-s">${p ? `<i class="dot pc${p.hue}"></i>` : ""}<span>${hl(t.n.title)}</span></div></div>
    ${m ? `<span class="row-m ${late ? "late" : ""}">${m}</span>` : ""}</div>`;
}
function noteRow(n, meta = "") {
  const p = projOf(n);
  return `<div class="row note" data-open="${n.id}">
    <span class="ico-doc"></span>
    <div class="row-main"><div class="row-t">${hl(n.title)}</div><div class="row-s">${p ? `<i class="dot pc${p.hue}"></i>` : ""}<span>${esc(nbPath(n.nb).at(-1))} · ${esc(snippet(n))}</span></div></div>
    ${meta ? `<span class="row-m">${meta}</span>` : ""}</div>`;
}
