const RAW = JSON.parse(document.getElementById("fixtures").textContent);
const NOW = Date.UTC(2026, 9, 29, 9, 30);
const notebooks = RAW.filter((d) => d._type === "notebook").map((d) => ({ id: d._id, name: d.name, parent: d.parent?._ref || null }));
const nbById = Object.fromEntries(notebooks.map((n) => [n.id, n]));
const notes = RAW.filter((d) => d._type === "note").map((d) => ({ id: d._id, title: d.title, nb: d.notebook._ref, tags: d.tags || [], blocks: d.body.blocks, links: (d.links || []).map((l) => l._ref), updated: Date.parse(d.updatedAt || "2026-10-01") }));
const byId = Object.fromEntries(notes.map((n) => [n.id, n]));
const pendingIds = new Set(["fx-note-29", "fx-note-28", "fx-note-25"]);

const inlineText = (c) => (c || []).map((x) => x.type === "text" ? x.value : inlineText(x.children)).join("");
const itemContent = (it) => Array.isArray(it) ? it : it.content;
function derive(n) {
  const hs = [], paras = []; let total = 0, done = 0, imgs = [];
  for (const b of n.blocks) {
    if (b.type === "heading") hs.push(b);
    if (b.type === "paragraph" && !b.content.some((x) => x.type === "wikilink")) paras.push(inlineText(b.content));
    if (b.type === "list" && b.task) for (const it of b.items) { total++; if (it.checked) done++; }
    if (b.type === "image") imgs.push(b);
  }
  n.headings = hs; n.snippet = paras.join(" "); n.tasks = { total, done }; n.images = imgs;
  n.text = (n.title + " " + n.blocks.map((b) => b.text || inlineText(b.content) + (b.items || []).map((i) => inlineText(itemContent(i))).join(" ") + (b.caption || "")).join(" ") + " " + n.tags.join(" ")).toLowerCase();
}
const ORIGINAL = Object.fromEntries(["fx-note-00", "fx-note-29"].map((id) => [id, JSON.stringify(byId_(id).blocks)]));
function byId_(id) { return RAW.find((d) => d._id === id).body; }
function restore() { for (const [id, b] of Object.entries(ORIGINAL)) { const n = byId[id]; n.blocks = JSON.parse(b); derive(n); } }
function backlinksOf(id) { return notes.filter((n) => n.links.includes(id)); }
notes.forEach(derive);
