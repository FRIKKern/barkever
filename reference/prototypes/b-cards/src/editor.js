function inlineHTML(c) {
  return (c || []).map((x) => x.type === "text" ? esc(x.value)
    : x.type === "wikilink" ? `<a class="wikilink" contenteditable="false" data-go="${x.docId}">${esc(inlineText(x.children))}</a>` : "").join("");
}
function blockHTML(n, b, editable = true) {
  const ce = editable ? ' contenteditable="true" spellcheck="false"' : "";
  if (b.type === "heading") return `<h2 id="b-${b.id}" data-block="${b.id}"${ce}>${esc(b.text)}</h2>`;
  if (b.type === "paragraph") return `<p id="b-${b.id}" data-block="${b.id}"${ce}>${inlineHTML(b.content)}</p>`;
  if (b.type === "list" && b.task) return `<ul class="tasks" id="b-${b.id}">${b.items.map((it, i) =>
    `<li id="b-${b.id}-${i}" class="${it.checked ? "done" : ""}"><button class="cb ${it.checked ? "on" : ""}" data-toggle="${n.id}|${b.id}|${i}" aria-label="Toggle">${it.checked ? ico("check") : ""}</button><span class="t" data-block="${b.id}" data-item="${i}"${ce}>${inlineHTML(itemContent(it))}</span></li>`).join("")}</ul>`;
  if (b.type === "list") return `<ul id="b-${b.id}">${b.items.map((it, i) => `<li data-block="${b.id}" data-item="${i}"${ce}>${inlineHTML(itemContent(it))}</li>`).join("")}</ul>`;
  if (b.type === "image") return `<figure id="b-${b.id}"><div class="frame">${b.svg}</div><figcaption>${esc(b.caption)}</figcaption></figure>`;
  return "";
}
function railHTML(n) {
  const bl = backlinksOf(n.id).length;
  const facts = [
    n.headings.length ? [ico("outline", "ico-s"), `${n.headings.length} ${n.headings.length === 1 ? "heading" : "headings"}`] : null,
    n.tasks.total ? [progress(n, false), `<span class="num">${n.tasks.done} of ${n.tasks.total}</span> done`] : null,
    n.images.length ? [`<svg class="ico ico-s" viewBox="0 0 16 16"><rect x="2.5" y="3.5" width="11" height="9" rx="1.5"/><path d="M4.5 10.5 7 8l2 2 1.5-1.5 1.5 1.5"/></svg>`, `${n.images.length} ${n.images[0].kind}`] : null,
    (n.links.length || bl) ? [ico("link", "ico-s"), `<span class="num">${n.links.length}</span> out · <span class="num">${bl}</span> in`] : null,
  ].filter(Boolean);
  return `<aside class="rail" aria-label="Note shape">
    <div class="rail-shape">${shapeSVG(n, 3)}</div>
    ${facts.length ? `<ul class="rail-facts">${facts.map(([i, t]) => `<li>${i}<span>${t}</span></li>`).join("")}</ul>` : ""}
    ${n.headings.length ? `<h4>Outline</h4><div class="rail-ol">${n.headings.map((h) => `<button data-scroll="b-${h.id}">${esc(h.text)}</button>`).join("")}</div>` : ""}
  </aside>`;
}
function topBar(n) {
  const nb = nbById[n.nb]; const parent = nb?.parent ? nbById[nb.parent] : null;
  return `<div class="bar-top">
    <span class="crumbs">${parent ? `${esc(parent.name)} ${ico("chevron", "ico-s")}` : ""}<b>${esc(nb?.name || "")}</b></span>
    <span class="saved">${S.off ? `<span class="sync-dot off"></span>Saved on this Mac` : `<span class="sync-dot"></span>Saved`}</span>
    ${ui.aiOn ? `<button class="tool" data-act="ai-menu" aria-pressed="${S.ask || S.edit}" aria-haspopup="menu" title="AI (one per pane)"><span class="spark">${ico("spark")}</span>AI</button>` : ""}
    <button class="tool" title="More">${ico("dots")}</button>
    ${ui.aiMenu ? `<div class="ai-menu" role="menu">
      <button data-act="open-ask" role="menuitem"><span class="spark">${ico("spark")}</span>Ask your notes</button>
      <button data-act="open-edit" role="menuitem"><span class="spark">${ico("spark")}</span>Edit selection</button>
      <div class="note">Claude · your subscription. Reads notes as data, never writes without your OK.</div></div>` : ""}
  </div>`;
}
function renderMain() {
  const main = $("#main");
  if (S.v === "tasks") return renderBoard(main);
  const n = byId[S.n];
  if (!n) { main.innerHTML = `<div class="empty-main">Pick a note on the left.</div>`; return; }
  if (S.conf && !ui.conflictResolved) return renderConflict(main, n);
  const editing = S.edit && n.id === "fx-note-00";
  if (editing && !ui.hunks) ui.hunks = makeHunks();
  const bl = backlinksOf(n.id);
  const meta = [`Edited ${when(n.updated).toLowerCase()}`, ...(n.tags.length ? [n.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join(" ")] : [])];
  main.innerHTML = topBar(n) + `<div class="doc-wrap" id="docwrap"><div class="doc-grid ${$("#main").clientWidth < 800 ? "narrow" : ""}">
    <article class="doc">
      ${editing ? editBarHTML() : ""}
      <h1 class="doc-title" contenteditable="${editing ? "false" : "true"}" spellcheck="false" data-title="${n.id}">${esc(n.title)}</h1>
      <div class="doc-meta">${meta.join('<span class="dot"></span>')}</div>
      <div class="body" data-doc="${n.id}">${editing ? editBodyHTML(n) : n.blocks.map((b) => blockHTML(n, b)).join("")}</div>
      ${bl.length ? `<section class="backlinks"><h3>Linked from ${bl.length} ${bl.length === 1 ? "note" : "notes"}</h3><div class="mini-cards">${bl.map(miniHTML).join("")}</div></section>` : ""}
    </article>
    ${railHTML(n)}
  </div></div>`;
  if (S.line && ui.flashed !== S.n + S.line) {
    const el = document.getElementById("b-" + S.line);
    if (el) { ui.flashed = S.n + S.line; el.scrollIntoView({ block: "center" }); el.classList.add("flash"); }
  }
}
const miniHTML = (m) => `<button class="mini" data-go="${m.id}">${shapeSVG(m, .8)}<span><span class="t">${esc(m.title)}</span><span class="s">${esc(nbById[m.nb]?.name)} · ${when(m.updated)}</span></span></button>`;
