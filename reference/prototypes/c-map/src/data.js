const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const RAW = JSON.parse($("#fixtures").textContent);
const NB = RAW.filter((d) => d._type === "notebook");
const NOTES = RAW.filter((d) => d._type === "note");
const byId = Object.fromEntries(NOTES.map((n) => [n._id, n]));
const nbById = Object.fromEntries(NB.map((n) => [n._id, n]));
const nbColor = (id) => `var(--nb-${id.replace("fx-nb-", "")})`;
const nbChildren = (id) => NB.filter((n) => n.parent?._ref === id).map((n) => n._id);
const nbScope = (id) => [id, ...nbChildren(id)];
const nbPath = (id) => { const nb = nbById[id]; return nb.parent ? [nbById[nb.parent._ref].name, nb.name] : [nb.name]; };

const NOW = new Date("2026-10-29T10:00:00");
NOTES.forEach((n, i) => { n._updated = new Date(+NOW - (((i * 17) % 50) * 7.3 + 0.3) * 3600e3); });
let touchN = 0;
const touch = (n) => { n._updated = new Date(+NOW + ++touchN * 60e3); };
function fmtDate(d) {
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((day(NOW) - day(d)) / 864e5);
  if (diff <= 0) return d.toTimeString().slice(0, 5);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const itemContent = (it) => (Array.isArray(it) ? it : it.content);
const inlineText = (c) => (c || []).map((x) => (x.type === "text" ? x.value : x.type === "wikilink" ? x.children.map((y) => y.value).join("") : "")).join("");
const blockText = (b) => (b.type === "heading" ? b.text : b.type === "paragraph" ? inlineText(b.content) : b.type === "list" ? b.items.map((it) => inlineText(itemContent(it))).join(" · ") : "");
const noteText = (n) => n.body.blocks.map(blockText).join(" ");
const sentences = (n) => n.body.blocks.filter((b) => b.type === "paragraph").flatMap((b) => inlineText(b.content).split(/(?<=[.?!])\s+/)).filter(Boolean);
const snippet = (n) => { const b = n.body.blocks.find((b) => b.type === "paragraph" && inlineText(b.content).trim()); return b ? inlineText(b.content) : "No text yet"; };
const matches = (n, q) => { const t = (n.title + " " + noteText(n) + " " + n.tags.join(" ")).toLowerCase(); return q.toLowerCase().split(/\s+/).filter(Boolean).every((x) => t.includes(x)); };

const outs = (id) => [...new Set((byId[id]?.links || []).map((l) => l._ref).filter((r) => byId[r] && r !== id))];
const backs = (id) => NOTES.filter((n) => n._id !== id && n.links.some((l) => l._ref === id)).map((n) => n._id);
const nbrs = (id) => [...new Set([...outs(id), ...backs(id)])];
const degree = (id) => nbrs(id).length;
const linkCount = () => NOTES.reduce((s, n) => s + outs(n._id).length, 0);
function tagRelated(id, max) {
  const n = byId[id]; const skip = new Set([id, ...nbrs(id)]);
  return NOTES.filter((m) => !skip.has(m._id) && m.tags.some((t) => n.tags.includes(t)))
    .map((m) => ({ id: m._id, s: m.tags.filter((t) => n.tags.includes(t)).length + (m.notebook._ref === n.notebook._ref ? 0.5 : 0) + degree(m._id) * 0.1 }))
    .sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.id);
}
function linkContext(fromId, toId) {
  const b = byId[fromId].body.blocks.find((b) => b.type === "paragraph" && b.content.some((x) => x.type === "wikilink" && x.docId === toId));
  return b ? inlineText(b.content) : "";
}
function wrapLabel(t, max, lines = 2) {
  const out = []; let cur = "";
  for (const w of t.split(/\s+/)) {
    if (!cur) cur = w; else if ((cur + " " + w).length <= max) cur += " " + w; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  const res = out.slice(0, lines).map((l) => (l.length > max ? l.slice(0, max - 1) + "…" : l));
  if (out.length > lines) res[lines - 1] = res[lines - 1].slice(0, max - 1) + "…";
  return res;
}

const S = {
  nb: "all", noteId: "fx-note-01", query: "", rail: "links", view: "notes",
  map: false, mapSel: null, mapHov: null, mapQ: "", vb: null,
  offline: false, pending: 0, conflict: null, ai: null,
  ask: [], aiOn: true, forced: false, mv: "note", tipId: null, stateN: 0,
};
const isMobile = () => S.forced || matchMedia("(max-width: 700px)").matches;

const ICON = {
  notes: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/></svg>',
  tasks: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="3" width="4" height="4" rx="1"/><path d="M9 5h4.5M9 11h4.5"/><rect x="2.5" y="9" width="4" height="4" rx="1"/></svg>',
  map: '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="4" cy="5" r="2"/><circle cx="12.3" cy="4" r="1.6"/><circle cx="9" cy="12" r="2.2"/><path d="M5.6 6.4 7.7 10.2M11.8 5.5l-1.8 4.6M6 4.8l4.7-.6"/></svg>',
  link: '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="2.5" cy="6" r="1.7"/><circle cx="9.5" cy="2.7" r="1.5"/><circle cx="9.5" cy="9.3" r="1.5"/><path d="M4 5.2 8 3.3M4 6.8l4 1.9"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3 5 8l5 5"/></svg>',
  ask: '<span style="font-size:15px;line-height:1">✨</span>',
};
