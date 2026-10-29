function route() { return S.view === "home" ? "#/home" : S.view === "board" ? `#/board/${S.board}` : `#/notes/${S.ctx.kind}${S.ctx.id ? ":" + S.ctx.id : ""}/${S.noteId}`; }
function go(patch, push = true) {
  Object.assign(S, patch); S.state = 0;
  if (patch.view && patch.view !== "notes") S.conflict = null;
  const list = S.view === "notes" ? ctxNotes() : [];
  if (list.length && !list.some((n) => n.id === S.noteId)) S.noteId = list[0].id;
  if (push && location.hash !== route()) history.pushState(null, "", route());
  render();
}
function parseRoute(h) {
  const [, v, a, b] = h.split("/");
  if (v === "board") return { view: "board", board: prById[a] ? a : "all" };
  if (v === "notes") { const [kind, id] = (a || "all").split(":"); return { view: "notes", ctx: { kind, id }, noteId: byId[b] ? b : S.noteId }; }
  return { view: "home" };
}
function selectNote(id) {
  if (S.ai && S.ai.noteId !== id) S.ai = null;
  go({ noteId: id, mpane: "editor", conflict: id === CONFLICT.id ? S.conflict : null });
}
function openNote(id, flash) {
  const n = byId[id]; if (!n) return;
  const inCtx = S.view === "notes" && ctxNotes().some((x) => x.id === id);
  const ctx = inCtx ? S.ctx : { kind: "nb", id: n.nb };
  if (!inCtx && S.q && !matchQ(n)) S.q = $("#q").value = "";
  if (S.ai && S.ai.noteId !== id) S.ai = null;
  go({ view: "notes", ctx, noteId: id, flash, mpane: "editor", conflict: id === CONFLICT.id ? S.conflict : null });
}
