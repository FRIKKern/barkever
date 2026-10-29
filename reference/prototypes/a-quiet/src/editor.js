const plural = (k, word) => `${k} ${word}${k === 1 ? "" : "s"}`;

function inlineHTML(c) {
  return (c || []).map((x) => x.type === "wikilink"
    ? `<a class="wl" data-open="${x.docId}" contenteditable="false">${ic("note")}${esc(inlineText(x.children))}</a>`
    : esc(x.value || "")).join("");
}

function checkItemHTML(n, b, it, i) {
  return `<li class="${it.checked ? "done" : ""}" data-b="${b.id}:${i}">
    <button class="cb ${it.checked ? "on" : ""}" contenteditable="false" data-check="${n._id}|${b.id}|${i}" aria-label="Toggle">${ic("check")}</button>
    <span>${inlineHTML(it.content)}</span></li>`;
}

function blockHTML(b, n) {
  if (b.type === "heading") return `<h2 data-b="${b.id}">${esc(b.text)}</h2>`;
  if (b.type === "paragraph") return `<p data-b="${b.id}">${inlineHTML(b.content)}</p>`;
  if (b.type === "list" && b.task) return `<ul class="cl" data-b="${b.id}">${items(b).map((it, i) => checkItemHTML(n, b, it, i)).join("")}</ul>`;
  const tag = b.ordered ? "ol" : "ul";
  return `<${tag} class="bl" data-b="${b.id}">${items(b).map((it) => `<li>${inlineHTML(it.content)}</li>`).join("")}</${tag}>`;
}

function crumbHTML(n) {
  const path = nbPath(n.notebook._ref);
  const icon = ic(path.length > 1 ? "stack" : "book");
  return `<button class="ib m-only" data-act="back">${ic("left")}</button>`
    + path.map((id, i) => `<a data-nb="${id}">${i === 0 ? icon : ""}${esc(nbName(id))}</a>`).join(`<span class="sep">/</span>`);
}

function metaHTML(n) {
  const pr = progress(n), bl = BACK[n._id] || [];
  return [
    bl.length && `<button class="chip accent" data-act="tobacklinks">${ic("back")}${plural(bl.length, "backlink")}</button>`,
    `<span>Edited ${longDate(n.updated)}</span>`,
    pr && `<span class="progress"><span class="bar"><i style="width:${(pr.done / pr.all) * 100}%"></i></span>${pr.done} of ${pr.all} done</span>`,
  ].filter(Boolean).join(`<span class="sep"></span>`);
}

function linkedHTML(n) {
  const bl = BACK[n._id] || [];
  if (!bl.length) return "";
  const card = (s) => `<div class="lcard" data-open="${s._id}"><div class="m">${esc(nbName(s.notebook._ref))} · ${shortDate(s.updated)}</div>
    <div class="t">${esc(s.title)}</div><div class="s">${esc(plain(s, true))}</div></div>`;
  return `<div class="linked" id="linked"><div class="caps">${ic("back")}Linked from ${plural(bl.length, "note")}</div>
    <div class="lcards">${bl.map((id) => card(byId[id])).join("")}</div></div>`;
}

function docHTML(n) {
  if (S.conflict && !CONFLICT_DONE && n._id === CONFLICT.note) return conflictHTML(n);
  if (S.edit && EDIT?.note === n._id) return editDocHTML(n);
  return `<div class="doc">
    <h1 class="title" contenteditable="true" spellcheck="false" data-title>${esc(n.title)}</h1>
    <div class="doc-meta">${metaHTML(n)}</div>
    <div class="body" contenteditable="true" spellcheck="false" data-body>${n.body.blocks.map((b) => blockHTML(b, n)).join("")}</div>
    ${linkedHTML(n)}</div>`;
}

function toolbarHTML() {
  const aiEdit = S.aiOff ? "" : `<button class="tb ${S.edit ? "on" : ""}" data-act="aiedit" title="Rewrite with AI; you review every change">${ic("pen")}AI Edit</button>`;
  return `<div class="tool">
    <button class="tb lead drop" data-act="insert">${ic("plus")}Insert</button>${aiEdit}
    <span class="div"></span><button class="tb drop">Body text</button><button class="tb drop d-only">Sans serif</button><button class="tb drop d-only">15</button>
    <span class="div"></span><button class="tb"><b>B</b></button><button class="tb"><i>I</i></button><button class="tb"><u>U</u></button><button class="tb d-only">${ic("hl")}</button>
    <span class="div"></span><button class="tb">${ic("bullets")}</button><button class="tb">${ic("ordered")}</button><button class="tb">${ic("task")}</button>
    <span class="div d-only"></span><button class="tb d-only" title="Link to note">${ic("link")}</button><button class="tb d-only">${ic("more")}</button></div>`;
}

function footHTML(n) {
  const saved = S.offline
    ? `<span class="saved off">${ic("laptop")}Saved on this Mac</span>`
    : `<span class="saved" id="saved">${ic("check")}All changes saved</span>`;
  return `<div class="ed-foot">${ic("tag")}${n.tags.map((t) => `<button class="chip" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}
    <button class="chip add">+ Add tag</button>${saved}</div>`;
}

function renderEditor() {
  const n = byId[S.note], ed = $("#ed");
  if (!n) { ed.innerHTML = `<div class="ed-main"><div class="empty" style="margin:auto">${ic("note")}Pick a note, or press <span class="kbd">N</span> for a new one.</div></div>`; return; }
  const fab = S.aiOff ? "" : `<button class="fab ${S.ask ? "on" : ""}" data-act="ask" title="Ask your notes">${ic("spark")}</button>`;
  ed.innerHTML = `<div class="ed-main">
      <div class="ed-top"><div class="crumb">${crumbHTML(n)}</div>
        <div class="ed-actions"><span class="who d-only">${ic("lock")}Only you</span><button class="btn sm d-only">${ic("share")}Share</button><button class="ib" title="More">${ic("more")}</button></div></div>
      ${toolbarHTML()}${S.edit && EDIT?.note === n._id ? editBarHTML() : ""}
      <div class="ed-scroll">${docHTML(n)}</div>${footHTML(n)}${fab}
    </div>${S.ask && !S.aiOff ? askHTML() : ""}`;
  const ask = $("#askbody");
  if (ask) ask.scrollTop = ask.scrollHeight;
}
