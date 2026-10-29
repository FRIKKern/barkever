const CLEAR = { tag: null, q: "", scr: "list", drawer: false, edit: false, conflict: false };
const INSERT = [["image", "Image"], ["file", "File"], ["task", "Checklist"], ["table", "Table"], ["link", "Link to note"], ["code", "Code block"], ["minus", "Divider"]];

function toggleCheck(ref) {
  const [nid, bid, i] = ref.split("|");
  const it = byId[nid].body.blocks.find((x) => x.id === bid).items[+i];
  it.checked = !it.checked;
  render();
}

function openCite(id, qt) {
  const blk = byId[id].body.blocks.find((b) => blockText(b).includes(qt));
  openNote(id, { ask: S.ask });
  if (blk) flashLine(blk.id);
}

function toggleInsertMenu(btn) {
  if ($(".menu")) return $(".menu").remove();
  const r = btn.getBoundingClientRect(), menu = document.createElement("div");
  menu.className = "menu";
  menu.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom + 4}px`;
  menu.innerHTML = INSERT.map(([i, l]) => `<div class="mi">${ic(i)}${l}</div>`).join("");
  document.body.appendChild(menu);
}

const ACTS = {
  new: () => newNote(),
  ask: () => go({ ask: !S.ask, edit: false }, "replace"),
  aiedit: () => (S.edit ? go({ edit: false }) : startEdit()),
  acceptall: () => EDIT.changes.forEach((c, k) => resolveHunk(k, "yes")),
  rejectall: () => EDIT.changes.forEach((c, k) => resolveHunk(k, "no")),
  undoedit: () => { byId[EDIT.note].body = JSON.parse(EDIT.snapshot); EDIT = null; toast("AI Edit undone. The note is back as it was."); go({ edit: false }); },
  doneedit: () => { EDIT = null; go({ edit: false }); },
  aioff: () => { toast("AI is off. ✨ and AI Edit are hidden.", "Turn on", () => go({ aiOff: false })); go({ aiOff: true, ask: false, edit: false }); },
  theme: () => go({ theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }, "replace"),
  clearq: () => go({ q: "" }),
  cleartag: () => go({ tag: null }),
  reconnect: () => { toast("Back online. 3 edits synced."); go({ offline: false }); },
  tobacklinks: () => $("#linked")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  back: () => go({ scr: "list" }),
  drawer: () => go({ drawer: !S.drawer }, "replace"),
};

const CLICKS = {
  tw: (v) => { OPEN_STACKS.has(v) ? OPEN_STACKS.delete(v) : OPEN_STACKS.add(v); renderSidebar(); },
  state: (v) => applyState(+v),
  check: toggleCheck,
  hunk: (v) => { const [k, st] = v.split("|"); resolveHunk(+k, st); },
  keep: (v) => keepVersion(v),
  cite: (v, d) => openCite(v, d.qt),
  line: (v) => { const [nid, sel] = v.split("|"); openNote(nid); flashLine(sel); },
  tf: (v) => go({ tf: v }, "replace"),
  tag: (v) => go({ ...CLEAR, view: "notes", nb: null, tag: v }),
  view: (v) => go({ ...CLEAR, view: v, nb: null, ask: false }),
  nb: (v) => go({ ...CLEAR, view: "notes", nb: v }),
  row: (v) => go({ note: v, scr: "note", edit: S.edit && EDIT?.note === v, conflict: S.conflict && v === CONFLICT.note }),
  open: (v) => openNote(v),
  act: (v, d, el) => (v === "insert" ? toggleInsertMenu(el) : ACTS[v]?.()),
};

document.addEventListener("click", (e) => {
  const el = e.target.closest(Object.keys(CLICKS).map((k) => `[data-${k}]`).join(","));
  if (el?.dataset.act !== "insert") $(".menu")?.remove();
  if (!el) return;
  const key = Object.keys(CLICKS).find((k) => k in el.dataset);
  e.preventDefault();
  CLICKS[key](el.dataset[key], el.dataset, el);
});

document.addEventListener("input", (e) => {
  const t = e.target, n = byId[S.note];
  if (t.id === "q" || "msearch" in t.dataset) return go({ q: t.value, scr: "list", view: WIDE.has(S.view) ? "notes" : S.view }, "replace");
  if (!n) return;
  if ("title" in t.dataset) {
    n.title = t.textContent;
    const row = $(`[data-row="${n._id}"] .row-t`);
    if (row) row.textContent = n.title || "Untitled";
  }
  const s = $("#saved");
  if (!s) return;
  s.innerHTML = `${ic("clock")}Saving…`;
  clearTimeout(s.timer);
  s.timer = setTimeout(() => (s.innerHTML = `${ic("check")}All changes saved`), 500);
});

window.addEventListener("resize", () => render());
