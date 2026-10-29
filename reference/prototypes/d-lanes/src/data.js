const D = DATA;
const byId = Object.fromEntries(D.notes.map((n) => [n.id, n]));
const nbById = Object.fromEntries(D.notebooks.map((b) => [b.id, b]));
const prById = Object.fromEntries(D.projects.map((p) => [p.id, p]));
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const [Y, M, DD] = D.today.split("-").map(Number);
const day = (n) => new Date(Y, M - 1, DD + n);
const isWe = (n) => [0, 6].includes(day(n).getDay());
const dShort = (n) => `${WD[day(n).getDay()]} ${day(n).getDate()}`;
const dLong = (n) => `${day(n).getDate()} ${MO[day(n).getMonth()]}`;
const dueLabel = (n) => n == null ? "No date" : n < 0 ? `${-n}d late` : n === 0 ? "Today" : n === 1 ? "Tomorrow" : n <= 6 ? dShort(n) : dLong(n);
const dueCls = (n) => n == null ? "none" : n < 0 ? "late" : n === 0 ? "today" : "";
const NOW_MIN = D.now.split(":").reduce((h, m) => +h * 60 + +m);
function editedLabel(min) {
  const t = NOW_MIN + min;
  if (min > -60) return `${-min} min ago`;
  if (t >= 0) { const h = Math.floor(t / 60), m = t % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
  const back = Math.ceil(-t / 1440);
  return back === 1 ? "Yesterday" : back < 7 ? WD[day(-back).getDay()] : dLong(-back);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const inl = (c) => c.type === "text" ? c.value : (c.children || []).map((x) => x.value).join("");
const txt = (content) => (content || []).map(inl).join("");
const blockText = (b) => b.text ?? (b.content ? txt(b.content) : (b.items || []).map((i) => txt(i.content || i)).join(" · "));
const plain = (n) => n.blocks.map(blockText).join(" ");
const snippet = (n) => { const b = n.blocks.find((b) => b.type === "paragraph"); return b ? txt(b.content) : ""; };
const projOf = (n) => n.project ? prById[n.project] : null;
const nbPath = (id) => { const b = nbById[id]; return b.parent ? [nbById[b.parent].name, b.name] : [b.name]; };

function tasks() {
  const out = [];
  for (const n of D.notes) for (const b of n.blocks) if (b.task) b.items.forEach((it, i) => out.push({ k: "t", n, b, i, it, key: `${b.id}:${i}`, text: txt(it.content) }));
  return out;
}
const taskByKey = (key) => tasks().find((t) => t.key === key);
const datedNotes = () => D.notes.filter((n) => n.day != null).map((n) => ({ k: "n", n, key: n.id, text: n.title }));
const laneOf = (t) => t.it.checked ? "done" : t.it.due == null ? "none" : t.it.due <= 0 ? "today" : t.it.due <= 6 ? "week" : t.it.due <= 13 ? "next" : "later";
const boardCol = (t) => ({ done: "done", today: "today", week: "week" }[laneOf(t)] || "later");
