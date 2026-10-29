const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const isTyping = (el) => !!el?.closest?.("input,textarea,[contenteditable=true]");

function parseT(s) {
  const [y, m, d, h, mi] = s.split(/[-T:]/).map(Number);
  return new Date(y, m - 1, d, h || 0, mi || 0);
}
const NOW = parseT(META.now);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysAgo = (s) => Math.round((day0(NOW) - day0(parseT(s))) / 864e5);
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const monDay = (d) => `${MON[d.getMonth()]} ${d.getDate()}`;

function shortDate(s) {
  const d = parseT(s), n = daysAgo(s);
  if (n === 0) return hhmm(d);
  if (n === 1) return "Yesterday";
  return n < 7 ? WD[d.getDay()] : monDay(d);
}

function longDate(s) {
  const d = parseT(s), n = daysAgo(s);
  const day = n === 0 ? "today" : n === 1 ? "yesterday" : monDay(d) + ",";
  return `${day} ${hhmm(d)}`;
}

function groupOf(s) {
  const d = parseT(s), n = daysAgo(s);
  if (n === 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 7) return "Earlier this week";
  return d.getMonth() === NOW.getMonth() ? `Earlier in ${MONTH[d.getMonth()]}` : MONTH[d.getMonth()];
}

const items = (b) => b.items.map((it) => (Array.isArray(it) ? { content: it } : it));
const inlineText = (c) => (c || []).map((x) => (x.type === "wikilink" ? inlineText(x.children) : x.value || "")).join("");

function blockText(b, sep = " ") {
  if (b.type === "paragraph") return inlineText(b.content);
  if (b.type === "list") return items(b).map((i) => inlineText(i.content)).join(sep);
  return "";
}
const plain = (n, skipTasks = false) => n.body.blocks.filter((b) => !(skipTasks && b.task)).map((b) => blockText(b, " · ")).filter(Boolean).join("  ");

const nbName = (id) => nbById[id]?.name ?? "";
const nbPath = (id) => (nbById[id]?.parent ? [nbById[id].parent, id] : [id]);
const notesIn = (nb) => NOTES.filter((n) => n.notebook._ref === nb || nbById[n.notebook._ref]?.parent === nb);
const sortRecent = (arr) => [...arr].sort((a, b) => (a.updated < b.updated ? 1 : -1));

const tasksOf = (n) => n.body.blocks.filter((b) => b.type === "list" && b.task).flatMap((b) => items(b).map((it, i) => ({ n, b, i, it })));
function progress(n) {
  const t = tasksOf(n);
  return t.length ? { done: t.filter((x) => x.it.checked).length, all: t.length } : null;
}

const BACK = {};
NOTES.forEach((n) => n.links.forEach((l) => (BACK[l._ref] ||= []).push(n._id)));

const terms = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function hl(html, q) {
  const t = terms(q);
  return t.length ? html.replace(new RegExp(`(${t.map((x) => reEsc(esc(x))).join("|")})`, "gi"), "<mark>$1</mark>") : html;
}

function matches(n, q) {
  const hay = `${n.title} ${plain(n)} ${n.tags.join(" ")}`.toLowerCase();
  return terms(q).every((t) => hay.includes(t));
}

function snippet(n, q) {
  const p = plain(n, !q);
  const i = q ? p.toLowerCase().indexOf(terms(q)[0]) : -1;
  return i > 40 ? "…" + p.slice(i - 30) : p;
}
