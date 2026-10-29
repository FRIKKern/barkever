const taskItems = () => NOTES.flatMap((n) => n.body.blocks.filter((b) => b.task).flatMap((b) => b.items));

function renderSidebar() {
  const count = (id) => NOTES.filter((n) => nbScope(id).includes(n.notebook._ref)).length;
  const on = (k) => (S.view === "notes" && S.nb === k ? " on" : "");
  const item = (nb, child) => `<button class="si${child ? " child" : ""}${on(nb._id)}" data-nb="${nb._id}"><span class="dot" style="background:${nbColor(nb._id)}"></span>${esc(nb.name)}<span class="n">${count(nb._id)}</span></button>`;
  let h = `<button class="si${on("all")}" data-nb="all">${ICON.notes}All notes<span class="n">${NOTES.length}</span></button>`;
  h += `<button class="si${S.view === "tasks" ? " on" : ""}" data-act="tasks">${ICON.tasks}Tasks<span class="n">${taskItems().filter((i) => !i.checked).length}</span></button>`;
  h += `<button class="si" data-act="openmap">${ICON.map}Map<span class="n"><kbd>M</kbd></span></button>`;
  h += `<div class="side-h">Notebooks</div>`;
  for (const nb of NB.filter((n) => !n.parent)) h += item(nb) + nbChildren(nb._id).map((c) => item(nbById[c], true)).join("");
  h += `<button class="mini" data-act="openmap" aria-label="Open the map"><div class="mini-h"><b>Map</b>${NOTES.length} notes · ${linkCount()} links</div><svg viewBox="-10 -10 ${MAP.W + 20} ${MAP.H + 20}">${mapSVG({ mode: "mini", sel: S.noteId })}</svg></button>`;
  $("#side").innerHTML = h;
  $("#sync").textContent = S.offline ? `Offline · ${S.pending} waiting` : "Synced";
}

function listNotes() {
  const q = S.query.trim();
  let arr = NOTES;
  if (q) arr = arr.filter((n) => matches(n, q));
  else if (S.nb !== "all") arr = arr.filter((n) => nbScope(S.nb).includes(n.notebook._ref));
  return arr.slice().sort((a, b) => b._updated - a._updated);
}

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function hiText(t, q) {
  const terms = q.split(/\s+/).filter(Boolean);
  return terms.length ? esc(t).replace(new RegExp(`(${terms.map(reEsc).join("|")})`, "gi"), "<mark>$1</mark>") : esc(t);
}

function renderList() {
  const arr = listNotes(); S.visible = arr.map((n) => n._id);
  const q = S.query.trim();
  const title = q ? "Search" : S.nb === "all" ? "All notes" : nbById[S.nb].name;
  const dot = !q && S.nb !== "all" ? `<span class="dot" style="background:${nbColor(S.nb)}"></span>` : "";
  $("#listh").innerHTML = `${dot}<b>${esc(title)}</b><span>${arr.length} note${arr.length === 1 ? "" : "s"}</span><span class="sort">Recent ↓</span>`;
  if (!arr.length) { $("#rows").innerHTML = `<div class="empty">Nothing matches “${esc(q)}”.</div>`; return; }
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  $("#rows").innerHTML = arr.map((n) => {
    const hit = q && sentences(n).find((s) => terms.some((t) => s.toLowerCase().includes(t)));
    const d = degree(n._id);
    const conflict = S.conflict?.noteId === n._id;
    return `<button class="row${n._id === S.noteId ? " sel" : ""}" data-open="${n._id}" role="option" aria-selected="${n._id === S.noteId}">
      <div class="row-top"><span class="row-title">${hiText(n.title || "Untitled", q)}</span><span class="row-date">${fmtDate(n._updated)}</span></div>
      <div class="row-bot"><span class="dot" style="background:${nbColor(n.notebook._ref)}"></span><span class="row-snip">${hiText(hit || snippet(n), q)}</span>${conflict ? `<span class="badge">2 versions</span>` : ""}${d ? `<span class="lk${d >= 3 ? " hub" : ""}" title="${d} linked notes">${ICON.link}${d}</span>` : ""}</div></button>`;
  }).join("");
}

function inlineHTML(c, cls = "") {
  return (c || []).map((x) => {
    if (x.type === "text") return esc(x.value);
    if (x.type === "wikilink") return `<a class="wl ${cls}" contenteditable="false" data-id="${esc(x.docId)}">${esc(byId[x.docId]?.title || inlineText(x.children))}</a>`;
    return "";
  }).join("");
}

function blockHTML(b) {
  if (b.type === "heading") return `<h${b.level} data-block="${b.id}">${esc(b.text)}</h${b.level}>`;
  if (b.type === "paragraph") return `<p data-block="${b.id}">${inlineHTML(b.content) || "<br>"}</p>`;
  if (b.task) return `<ul class="tasks" data-block="${b.id}">` + b.items.map((it, i) => `<li data-i="${i}" class="${it.checked ? "done" : ""}"><span class="cb" contenteditable="false" role="checkbox" aria-checked="${!!it.checked}"></span><span class="li-t">${inlineHTML(it.content)}</span></li>`).join("") + `</ul>`;
  if (b.type === "list") return `<ul data-block="${b.id}">` + b.items.map((it) => `<li>${inlineHTML(itemContent(it))}</li>`).join("") + `</ul>`;
  return "";
}

const nbDot = (id) => `<span class="dot" style="background:${nbColor(id)}"></span>`;
const crumbHTML = (n) => `<div class="crumb">${nbDot(n.notebook._ref)}${nbPath(n.notebook._ref).map(esc).join(" › ")}</div>`;
function metaHTML(n) {
  const d = degree(n._id);
  return `<div class="doc-meta"><span class="nbchip">${nbDot(n.notebook._ref)}${esc(nbById[n.notebook._ref].name)}</span>${n.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}<span>Edited ${fmtDate(n._updated)}</span><span class="lk${d >= 3 ? " hub" : ""}">${ICON.link}${backs(n._id).length} in · ${outs(n._id).length} out</span></div>`;
}

let edKey = "";
function renderEditor(force) {
  const n = byId[S.noteId];
  const mode = S.conflict?.noteId === n._id ? "conflict" : S.ai?.noteId === n._id ? "ai" : "edit";
  if (!force && n._id + mode === edKey && mode === "edit") return;
  edKey = n._id + mode;
  $("#app").classList.toggle("no-rail", mode === "conflict" && !isMobile());
  if (mode === "conflict") return renderConflict(n);
  const bar = `<div class="bar ed-bar">${crumbHTML(n)}<div class="ed-actions"><span class="saved">${S.offline ? "Saved on this Mac" : "Saved"}</span>${mode === "edit" ? `<button class="btn ghost" data-act="aiedit">✨ AI Edit</button>` : ""}</div></div>`;
  if (mode === "ai") return renderAIEdit(n, bar);
  $("#editor").innerHTML = bar + `<div class="ed-scroll"><article class="doc">
    <h1 class="doc-title" contenteditable="true" spellcheck="false" id="title">${esc(n.title)}</h1>
    ${metaHTML(n)}
    <div class="doc-body" contenteditable="true" spellcheck="false" id="body">${n.body.blocks.map(blockHTML).join("")}</div>
  </article></div>`;
}

function inlineFromDOM(el) {
  const out = [];
  const walk = (node) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) out.push({ type: "text", value: c.textContent.replace(/ /g, " ") });
      else if (c.classList.contains("wl")) out.push({ type: "wikilink", target: c.dataset.id, docId: c.dataset.id, children: [{ type: "text", value: c.textContent }] });
      else if (!c.classList.contains("cb")) walk(c);
    }
  };
  walk(el);
  return out.filter((x) => x.type !== "text" || x.value);
}

function syncBody() {
  const n = byId[S.noteId];
  const old = Object.fromEntries(n.body.blocks.map((b) => [b.id, b]));
  n.body.blocks = [...$("#body").children].map((el, i) => {
    const id = el.dataset.block || `${n._id}-e${i}`;
    if (/^H\d$/.test(el.tagName)) return { id, type: "heading", level: +el.tagName[1], text: el.textContent };
    if (el.tagName === "UL") {
      const task = el.classList.contains("tasks");
      const items = [...el.children].map((li) => (task ? { content: inlineFromDOM(li.querySelector(".li-t") || li), checked: li.classList.contains("done") } : inlineFromDOM(li)));
      return { ...old[id], id, type: "list", items };
    }
    return { id, type: "paragraph", content: inlineFromDOM(el) };
  });
  const refs = new Set(n.body.blocks.flatMap((b) => (b.type === "list" ? b.items.flatMap(itemContent) : b.content || [])).filter((x) => x.type === "wikilink").map((x) => x.docId));
  n.links = [...refs].map((r) => ({ _ref: r, _key: r }));
  changed(n);
}

let syncT = 0;
function changed(n) {
  touch(n);
  if (S.offline) { S.pending++; $("#pending").textContent = `${S.pending} edits waiting`; }
  clearTimeout(syncT);
  syncT = setTimeout(() => { renderList(); renderSidebar(); renderRail(false); const m = $(".doc-meta"); if (m) m.outerHTML = metaHTML(n); }, 250);
}
