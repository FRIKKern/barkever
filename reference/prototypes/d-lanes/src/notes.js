function renderNotes() {
  const list = ctxNotes();
  if (!list.find((n) => n.id === S.noteId) && list[0] && !S.conflict) S.noteId = list[0].id;
  const rows = list.map((n) => {
    const p = projOf(n);
    const ts = n.blocks.filter((b) => b.task).flatMap((b) => b.items);
    const done = ts.filter((i) => i.checked).length;
    const prog = ts.length ? `<span class="prog"><i><b style="width:${(done / ts.length) * 100}%"></b></i>${done}/${ts.length}</span>` : "";
    return `<div class="nrow ${n.id === S.noteId ? "on" : ""}" data-note="${n.id}"><div class="n1"><span class="t">${hl(n.title || "Untitled")}</span><span class="d">${editedLabel(n.edited)}</span></div>
      <div class="n2">${p ? `<i class="dot pc${p.hue}"></i>` : ""}<span class="s">${hl(snippet(n))}</span>${prog}</div></div>`;
  }).join("") || `<div class="empty" style="padding:16px 24px">No notes match “${esc(S.q)}”. Clear the search to see all.</div>`;
  const back = `<button class="btn back" data-act="mback">${ic.back}</button>`;
  return `<div class="notes ${S.mpane === "editor" ? "ed" : ""}">
    <section class="list"><div class="list-h"><b>${esc(ctxName(S.ctx))}</b><span>${list.length} notes</span><span class="sort">Edited ↓</span></div><div class="list-b" data-keep="list">${rows}</div></section>
    <section class="editor">${S.conflict ? renderConflict(back) : renderEditor(back)}</section></div>`;
}

function inlineHtml(content) {
  return content.map((c) => c.type === "wikilink" ? `<a class="wl" contenteditable="false" data-link="${c.docId || c.target}">${esc(inl(c))}</a>` : esc(c.value)).join("");
}
function renderEditor(back) {
  const n = byId[S.noteId];
  if (!n) return `<div class="empty" style="margin:auto">Pick a note on the left, or press N for a new one.</div>`;
  const p = projOf(n);
  const ai = S.ai && S.ai.noteId === n.id ? S.ai : null;
  const chg = (id) => ai && ai.changes.find((c) => c.target === id);
  const blocks = n.blocks.map((b) => {
    if (b.type === "heading") return `<h2 id="blk-${b.id}">${esc(b.text)}</h2>`;
    if (b.type === "paragraph") { const c = chg(b.id); return c ? changeCard(c) : `<p id="blk-${b.id}" contenteditable="true" data-para="${b.id}">${inlineHtml(b.content)}</p>`; }
    if (b.type === "list" && b.task) {
      return `<div class="checklist" id="blk-${b.id}">${b.items.map((it, i) => {
        const key = `${b.id}:${i}`, c = chg(key);
        if (c) return `<div style="padding:8px 8px 0">${changeCard(c, it)}</div>`;
        const d = it.due;
        const dueBtn = it.checked ? `<span class="due">${it.done != null ? "done " + dueLabel(it.done).replace(" late", " ago").replace("Today", "today") : "done"}</span>` : `<span class="due ${dueCls(d)}">${dueLabel(d)}</span>`;
        return `<div class="ck ${it.checked ? "done" : ""}" id="line-${key.replace(":", "-")}"><button class="cb ${it.checked ? "on" : ""}" data-tick="${key}" aria-label="Done"></button><span class="ck-t" contenteditable="true" data-item="${key}">${inlineHtml(it.content)}</span>${dueBtn}</div>`;
      }).join("")}</div>`;
    }
    if (b.type === "list") return `<ul id="blk-${b.id}">${b.items.map((it) => `<li>${inlineHtml(it.content || it)}</li>`).join("")}</ul>`;
    return "";
  }).join("");
  const backs = D.notes.filter((o) => o.links.includes(n.id));
  const aiStrip = ai ? (() => {
    const pend = ai.changes.filter((c) => c.status === "pending").length, acc = ai.changes.filter((c) => c.status === "accepted").length;
    return `<div class="ai-strip"><div class="ai-l"><b>${ic.spark} AI Edit</b> “${esc(ai.prompt)}”<div class="cost">${ai.changes.length} changes${pend ? ` · ${pend} to review` : ""} · Claude, your login · ≈0.3¢</div></div><span class="grow"></span>
      <button class="btn sm line" data-act="ai-all-no">Reject all</button><button class="btn sm line" data-act="ai-all-ok">Accept all</button><button class="btn sm primary" data-act="ai-done">${acc ? `Apply ${acc}` : "Close"}</button></div>`;
  })() : "";
  return `<div class="ed-bar">${back}<span>${nbPath(n.nb).map(esc).join(" › ")}</span>${p ? `<button class="pchip" data-board="${p.id}"><i class="dot pc${p.hue}"></i>${esc(p.name)}</button>` : ""}<span class="grow"></span><span>Edited ${editedLabel(n.edited)}</span>
    ${S.aiOn ? `<button class="btn ${ai ? "on" : ""}" data-act="ai-edit" title="Rewrite with a diff you accept per change">${ic.spark} Edit</button>` : ""}</div>
    <div class="ed-scroll" data-keep="ed"><article class="doc">
      ${aiStrip}
      <h1 class="d-title" contenteditable="true" data-title="${n.id}">${esc(n.title)}</h1>
      <div class="d-meta">${n.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}${n.day != null ? `<span class="due ${dueCls(n.day)}">${dueLabel(n.day)}</span>` : ""}</div>
      ${blocks}
      ${backs.length ? `<footer class="backlinks"><div class="sec-h">Linked from <em>· ${backs.length}</em></div>${backs.map((o) => noteRow(o, editedLabel(o.edited))).join("")}</footer>` : ""}
    </article></div>`;
}
