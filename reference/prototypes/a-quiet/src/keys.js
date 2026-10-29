function move(dir) {
  if (WIDE.has(S.view)) return;
  const list = currentList();
  if (!list.length) return;
  const i = list.findIndex((n) => n._id === S.note);
  const id = list[Math.max(0, Math.min(list.length - 1, i + dir))]._id;
  go({ note: id, edit: S.edit && EDIT?.note === id, conflict: S.conflict && id === CONFLICT.note }, "replace");
}

function focusSearch() {
  const q = $("#q");
  q?.focus();
  q?.select();
}

function onTypingKey(e, t) {
  if (t.id === "q" && e.key === "ArrowDown") { e.preventDefault(); t.blur(); move(1); }
  if ("title" in t.dataset && e.key === "Enter") { e.preventDefault(); $("[data-body]")?.focus(); }
  if (e.key !== "Escape") return;
  t.blur();
  if (t.id === "q" && S.q) go({ q: "" });
}

const KEYS = {
  ArrowDown: () => move(1),
  ArrowUp: () => move(-1),
  "/": focusSearch,
  n: newNote,
  t: ACTS.theme,
  Enter: () => $("[data-body]")?.focus(),
  Escape: () => { $(".menu")?.remove(); if (S.ask) go({ ask: false }, "replace"); else if (S.drawer) go({ drawer: false }, "replace"); },
};

document.addEventListener("keydown", (e) => {
  const t = e.target, mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); return focusSearch(); }
  if (isTyping(t)) return onTypingKey(e, t);
  if (mod || e.altKey) return;
  if (/^[1-8]$/.test(e.key)) return applyState(+e.key);
  if (!KEYS[e.key]) return;
  e.preventDefault();
  KEYS[e.key]();
});
