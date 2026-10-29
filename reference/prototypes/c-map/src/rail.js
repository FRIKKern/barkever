function renderRail(animate) {
  $$("#railtabs button").forEach((b) => b.classList.toggle("on", b.dataset.rail === S.rail));
  if (S.rail === "ask") return renderAsk();
  if (S.rail === "cluster") return renderCluster();
  renderLinks(animate);
}

function relRow(id, ctx) {
  const m = byId[id];
  return `<button class="rel-row" data-open="${id}"><span class="t">${nbDot(m.notebook._ref)}${esc(m.title)}</span>${ctx ? `<span class="c">${esc(ctx)}</span>` : ""}</button>`;
}

function renderLinks(animate) {
  const n = byId[S.noteId];
  const ins = backs(n._id), out = outs(n._id), rel = tagRelated(n._id, 4);
  const proposing = S.ai?.noteId === n._id && S.ai.changes.some((c) => c.link && c.status === "pending");
  const shared = (id) => "#" + byId[id].tags.filter((t) => n.tags.includes(t)).join(" #");
  $("#rail").innerHTML = `<div class="m-graph-h">Connections<button data-act="openmap">Map</button></div>
    <div class="graph"><svg id="lg" viewBox="0 0 ${LG.W} ${LG.H}" role="img" aria-label="Links of this note"></svg><div class="tip" id="tip" hidden></div>
    <div class="legend"><span><i></i>link</span><span><i class="t"></i>same tag</span>${proposing ? `<span><i class="p"></i>proposed</span>` : ""}</div></div>
    <div class="rel"><h4>Linked from · ${ins.length}</h4>${ins.map((id) => relRow(id, linkContext(id, n._id))).join("") || `<div class="rel-empty">No note links here yet.</div>`}</div>
    <div class="rel"><h4>Links to · ${out.length}</h4>${out.map((id) => relRow(id)).join("") || `<div class="rel-empty">This note links nowhere yet.</div>`}</div>
    ${rel.length ? `<div class="rel"><h4>Shares a tag</h4>${rel.map((id) => relRow(id, shared(id))).join("")}</div>` : ""}`;
  const svg = $("#lg");
  svg.onmouseover = (e) => { const g = e.target.closest(".g-node[data-gid]"); if (g) hoverGraph(g.dataset.gid); };
  svg.onmouseout = (e) => { const g = e.target.closest(".g-node[data-gid]"); if (g && !g.contains(e.relatedTarget)) hoverGraph(null); };
  renderLocalGraph(animate);
}

function renderCluster() {
  const n = byId[S.noteId]; const b = MAP.boxes[n.notebook._ref];
  const pad = 26, w = Math.max(b.w + pad * 2, 300), h = b.h + pad * 2;
  const ids = new Set(b.notes.map((m) => m._id));
  const inside = b.notes.reduce((s, m) => s + outs(m._id).filter((t) => ids.has(t)).length, 0);
  const across = {};
  for (const m of b.notes) for (const t of nbrs(m._id)) if (!ids.has(t)) { const o = byId[t].notebook._ref; across[o] = (across[o] || 0) + 1; }
  const rows = Object.entries(across).sort((x, y) => y[1] - x[1]);
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const bars = rows.map(([id, c]) => `<div class="cl-nb">${nbDot(id)}${esc(nbById[id].name)}<i style="width:${(c / max) * 120}px;background:${nbColor(id)}"></i><span class="n">${c}</span></div>`).join("");
  $("#rail").innerHTML = `<div class="cl-h"><b>${nbDot(b.id)}${esc(nbPath(b.id).join(" › "))}</b>${b.notes.length} notes · ${inside} links inside</div>
    <div class="graph"><svg viewBox="${b.x + b.w / 2 - w / 2} ${b.y - pad} ${w} ${h}">${mapSVG({ mode: "cluster", focus: b.id, sel: S.noteId, scale: 339 / w, prefix: "cl" })}</svg></div>
    <div class="rel"><h4>Connects to</h4>${bars || `<div class="rel-empty">No links to other notebooks yet.</div>`}</div>
    <div class="rail-foot"><button class="btn" data-act="openmap">${ICON.map}Open the full map <kbd>M</kbd></button></div>`;
}

const PRESET = {
  carousel: { read: 6, cites: [["fx-note-02", "Three wireframe rounds. Round two dropped the carousel."], ["fx-note-10", "Decision: drop the carousel."]],
    html: (c) => `<p>You dropped it. Round two of the Harbor wireframes removed the carousel ${c(1)}, and the week 41 sync logged it as a decision ${c(2)}.</p>` },
  dentist: { read: 3, notFound: true, cites: [["fx-note-25", "Before the end of the month."]],
    html: (c) => `<div class="nf"><b>Not in your notes.</b>No appointment date or time is written down. The closest note only says when to book ${c(1)}.</div>` },
};
const STOP = new Set("what when where which about with from that this have does did your there their they them would could should into over after before were been just also than then only some more most much many very tell know note notes give".split(" "));

function answer(q) {
  const ql = q.toLowerCase();
  if (ql.includes("carousel")) return PRESET.carousel;
  if (/dentist|appointment/.test(ql)) return PRESET.dentist;
  const terms = (ql.match(/[\p{L}\d]{4,}/gu) || []).filter((t) => !STOP.has(t)).map((t) => (t.length > 5 ? t.slice(0, -2) : t));
  const seen = new Set();
  const top = NOTES.flatMap((n) => sentences(n).map((s) => ({ id: n._id, s, score: terms.filter((t) => s.toLowerCase().includes(t)).length })))
    .filter((h) => h.score > 0).sort((a, b) => b.score - a.score)
    .filter((h) => !seen.has(h.id) && seen.add(h.id)).slice(0, 3);
  if (!top.length) return { read: NOTES.length, notFound: true, cites: [], html: () => `<div class="nf"><b>Not in your notes.</b>Nothing you have written mentions this. Ask won’t guess.</div>` };
  return { read: NOTES.length, cites: top.map((h) => [h.id, h.s]), html: (c) => `<p>Here is what your notes say:</p>` + top.map((h, i) => `<p>“${esc(h.s)}” ${c(i + 1)}</p>`).join("") };
}

function answerHTML({ q, a }) {
  const cite = (i, tag = "button") => { const [id, quote] = a.cites[i - 1]; return `<${tag} class="cite" data-open="${id}" data-quote="${esc(quote)}" title="${esc(byId[id].title)}">${i}</${tag}>`; };
  const srcs = a.cites.map(([id, quote], i) => `<button class="src" data-open="${id}" data-quote="${esc(quote)}"><span class="t">${cite(i + 1, "span")}${nbDot(byId[id].notebook._ref)}${esc(byId[id].title)}</span><span class="qt">“${esc(quote)}”</span></button>`).join("");
  const marks = Object.fromEntries(a.cites.map(([id], i) => [id, i + 1]));
  const where = !a.notFound ?`<div class="ask-map"><span class="cap">Where this came from</span><svg viewBox="-10 -10 ${MAP.W + 20} ${MAP.H + 20}">${mapSVG({ mode: "ask", marks, scale: 290 / (MAP.W + 20), prefix: "ak" })}</svg></div>` : "";
  return `<div class="q">${esc(q)}</div><div class="a">${a.html(cite)}${srcs ? `<div class="srcs">${srcs}</div>` : ""}${where}<div class="meta">${a.notFound ? "Checked" : "Read"} ${a.read} notes · Claude Sonnet · your login · ≈ $0.002</div></div>`;
}

function renderAsk() {
  const head = `<div class="ask-head"><div><strong>✨ Ask your notes</strong><span class="muted">Answers only from your notes and cites each one. Never edits.</span></div><label class="switch"><input type="checkbox" data-act="aitoggle" ${S.aiOn ? "checked" : ""}>AI</label></div>`;
  if (!S.aiOn) { $("#rail").innerHTML = `<div class="ask">${head}<div class="ai-off">AI is off. Nothing leaves this Mac.</div></div>`; return; }
  const tries = ["What did we decide about the carousel?", "What are the three bets for Q4?", "When is my dentist appointment?"];
  const sugg = S.ask.length ? "" : `<div class="sugg"><span class="muted">Try</span>${tries.map((t) => `<button class="chip" data-askq="${esc(t)}">${esc(t)}</button>`).join("")}</div>`;
  $("#rail").innerHTML = `<div class="ask">${head}<div class="thread">${S.ask.map(answerHTML).join("")}${sugg}</div>
    <div class="ask-in"><form data-form="ask"><input id="askq" placeholder="Ask about your notes…" autocomplete="off"><button class="btn primary">Ask</button></form><div class="fine">Note text is treated as data, never as instructions.</div></div></div>`;
}
