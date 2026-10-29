let toastTimer;
function toast(msg, action, fn) {
  const layer = $("#layer");
  clearTimeout(toastTimer);
  layer.innerHTML = `<div class="toast"><span>${esc(msg)}</span>${action ? `<button id="toastbtn">${action}</button>` : ""}</div>`;
  if (action) $("#toastbtn").onclick = () => { layer.innerHTML = ""; fn(); };
  toastTimer = setTimeout(() => (layer.innerHTML = ""), 4200);
}

function flashLine(sel) {
  requestAnimationFrame(() => {
    const el = $(`[data-b="${sel}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 60);
  });
}

function openNote(id, extra = {}) {
  const n = byId[id];
  if (!n) return;
  const inList = !WIDE.has(S.view) && currentList().includes(n);
  const where = inList ? {} : { view: "notes", nb: n.notebook._ref, tag: null, q: "", drawer: false };
  go({ ...where, note: id, scr: "note", ...extra });
}

function newNote() {
  const nb = S.nb || "fx-nb-inbox", id = "fx-note-n" + Date.now().toString(36);
  const body = { blocks: [{ id: id + "-p0", type: "paragraph", content: [{ type: "text", value: "" }] }] };
  const n = { _type: "note", _id: id, title: "", notebook: { _ref: nb }, tags: [], body, links: [], updated: META.now };
  NOTES.push(n);
  byId[id] = n;
  go({ view: "notes", nb, q: "", tag: null, note: id, scr: "note", edit: false, conflict: false });
  $("[data-title]")?.focus();
}
