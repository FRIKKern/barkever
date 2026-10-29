function openNote(id, extra = {}) { writeHash({ n: id, line: null, focus: false, edit: false, mn: true, ...extra }); }
function move(delta) {
  const list = visibleNotes(); if (!list.length) return;
  let i = list.findIndex((n) => n.id === S.n); i = i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + delta));
  writeHash({ n: list[i].id, line: null, focus: false, edit: false }, true);
  document.getElementById("c-" + list[i].id)?.scrollIntoView({ block: "nearest" });
  $("#cards").focus({ preventScroll: true });
}
function toggleItem(spec) {
  const [nid, bid, i] = spec.split("|"); const n = byId[nid]; const b = n.blocks.find((x) => x.id === bid);
  b.items[+i].checked = !b.items[+i].checked; n.updated = NOW; derive(n); render();
}
function syncFromDom(el) {
  const n = byId[el.closest("[data-doc]")?.dataset.doc]; if (!n) return;
  const b = n.blocks.find((x) => x.id === el.dataset.block); if (!b) return;
  const content = [...el.childNodes].map((c) => c.nodeType === 3 ? { type: "text", value: c.textContent }
    : c.classList?.contains("wikilink") ? { type: "wikilink", docId: c.dataset.go, target: c.dataset.go, children: [{ type: "text", value: c.textContent }] } : { type: "text", value: c.textContent });
  if (b.type === "heading") b.text = el.textContent;
  else if (el.dataset.item != null) { const it = b.items[+el.dataset.item]; if (Array.isArray(it)) b.items[+el.dataset.item] = content; else it.content = content; }
  else b.content = content;
  n.updated = NOW; derive(n); refreshCard(n);
}
function refreshCard(n) {
  const old = document.getElementById("c-" + n.id); if (!old) return;
  const tmp = document.createElement("div"); tmp.innerHTML = cardHTML(n, S.nb === "all" || !!S.q); old.replaceWith(tmp.firstElementChild);
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-state],[data-nb],[data-note],[data-go],[data-act],[data-toggle],[data-hunk],[data-scroll],[data-line]");
  if (!t) { if (ui.aiMenu) { ui.aiMenu = false; render(); } return; }
  if (t.dataset.state) return setPreset(+t.dataset.state);
  if (t.dataset.toggle) return toggleItem(t.dataset.toggle);
  if (t.dataset.nb) return writeHash({ v: "notes", nb: t.dataset.nb, q: "", n: visibleNotesFor(t.dataset.nb)[0]?.id || null, line: null, edit: false, mn: false });
  if (t.dataset.go) return openNote(t.dataset.go, S.v === "tasks" ? { v: "notes", nb: "all" } : {});
  if (t.dataset.line) { const [nid, line] = t.dataset.line.split("|"); return writeHash({ v: "notes", nb: byId[nid].nb, n: nid, line, mn: true }); }
  if (t.dataset.note) return writeHash({ n: t.dataset.note, line: null, focus: false, edit: false, mn: true });
  if (t.dataset.scroll) return document.getElementById(t.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (t.dataset.hunk) { const [i, st] = t.dataset.hunk.split("|"); ui.hunks[+i].state = st; if (ui.hunks.every((h) => h.state)) applyHunks(); return render(); }
  const a = t.dataset.act;
  if (a === "theme") return setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  if (a === "tasks") return writeHash({ v: "tasks", ask: false, mn: false });
  if (a === "m-notes") return writeHash({ v: "notes", mn: false, ask: false });
  if (a === "m-back") return writeHash({ mn: false });
  if (a === "m-ask") { ui.askThread = ui.askThread || seededThread(); return writeHash({ ask: true, mn: false }); }
  if (a === "ai-menu") { ui.aiMenu = !ui.aiMenu; return render(); }
  if (a === "open-ask") { ui.aiMenu = false; ui.askThread = ui.askThread || []; return writeHash({ ask: true }); }
  if (a === "open-edit") { ui.aiMenu = false; ui.hunks = null; return writeHash({ nb: "fx-nb-projects", n: "fx-note-00", edit: true }); }
  if (a === "close-ask") return writeHash({ ask: false });
  if (a === "ai-toggle") { ui.aiOn = !ui.aiOn; if (!ui.aiOn) return writeHash({ ask: false, edit: false }); return render(); }
  if (a === "edit-all-ok" || a === "edit-all-no") { ui.hunks.forEach((h) => { if (!h.state) h.state = a === "edit-all-ok" ? "acc" : "rej"; }); applyHunks(); return render(); }
  if (a === "edit-undo") { if (ui.editUndo) { byId["fx-note-00"].blocks = JSON.parse(ui.editUndo); derive(byId["fx-note-00"]); } ui.hunks = null; ui.editUndo = null; toast("AI edit undone."); return writeHash({ edit: false }); }
  if (a === "edit-close") { ui.hunks = null; ui.editUndo = null; return writeHash({ edit: false }); }
  if (a === "resolve") return resolveConflict(t.dataset.keep);
});
function visibleNotesFor(nb) { const save = S; S = { ...S, nb, q: "" }; const l = visibleNotes(); S = save; return l; }
document.addEventListener("input", (e) => {
  if (e.target.id === "q") return writeHash({ q: e.target.value, s: S.s }, true);
  if (e.target.dataset.title) { const n = byId[e.target.dataset.title]; n.title = e.target.textContent; n.updated = NOW; derive(n); return refreshCard(n); }
  if (e.target.dataset.block) syncFromDom(e.target);
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "askform") return; e.preventDefault();
  const q = $("#askq").value.trim(); if (!q) return;
  ui.askThread = [...(ui.askThread || []), localAnswer(q)]; renderAsk(); $("#askq").focus();
});
document.addEventListener("keydown", (e) => {
  const typing = e.target.isContentEditable || /INPUT|TEXTAREA/.test(e.target.tagName);
  if (e.key === "Escape") {
    if (ui.aiMenu) { ui.aiMenu = false; return render(); }
    if (e.target.id === "q" && S.q) return writeHash({ q: "" }, true);
    if (typing) { e.target.blur(); return $("#cards")?.focus(); }
    if (S.ask) return writeHash({ ask: false });
    return;
  }
  if (e.target.id === "q" && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); return move(e.key === "ArrowDown" ? 1 : -1); }
  if (e.target.id === "q" && e.key === "Enter") { const f = visibleNotes()[0]; if (f) openNote(S.n || f.id); return; }
  if (typing) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key >= "1" && e.key <= "8") return setPreset(+e.key);
  if (e.key === "ArrowDown") { e.preventDefault(); return move(1); }
  if (e.key === "ArrowUp") { e.preventDefault(); return move(-1); }
  if (e.key === "/") { e.preventDefault(); return $("#q").focus(); }
  if (e.key === "Enter" && S.n) { e.preventDefault(); const p = $(".body [contenteditable]"); p?.focus(); return; }
  if (e.key === "t") return setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("bk-theme", t); } catch {} render(); }
window.addEventListener("hashchange", () => { S = readHash(); render(); });
window.addEventListener("resize", () => render());
(function boot() {
  let theme = new URLSearchParams(location.search).get("theme");
  if (!theme) { try { theme = localStorage.getItem("bk-theme"); } catch {} }
  if (!theme) theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  if (!location.hash) history.replaceState(null, "", "#" + PRESETS[1].hash);
  S = readHash(); if (S.s === 3) ui.askThread = seededThread();
  render();
})();
