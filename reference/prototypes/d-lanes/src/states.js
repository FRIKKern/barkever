function applyState(n) {
  Object.assign(S, { view: "home", ask: false, ai: null, conflict: null, offline: false, mobile: false, frame: false, toast: null, q: "", board: "all", mpane: "list", aiOn: true, convo: [] });
  $("#q").value = "";
  if (n === 2) Object.assign(S, { view: "notes", ctx: { kind: "nb", id: "fx-nb-projects" }, noteId: "fx-note-00" });
  if (n === 3) Object.assign(S, { view: "notes", ctx: { kind: "project", id: "harbor" }, noteId: "fx-note-13", ask: true, convo: structuredClone(SEED_CONVO) });
  if (n === 4) { Object.assign(S, { view: "notes", ctx: { kind: "nb", id: "fx-nb-projects" }, noteId: "fx-note-00" }); startAiEdit("fx-note-00"); S.ai.changes[0].status = "accepted"; }
  if (n === 5) Object.assign(S, { view: "board", board: "all" });
  if (n === 6) Object.assign(S, { offline: true });
  if (n === 7) byId[CONFLICT.id].edited = -99;
  if (n === 7) Object.assign(S, { view: "notes", ctx: { kind: "nb", id: "fx-nb-home" }, noteId: CONFLICT.id, conflict: true, offline: false });
  if (n === 8) Object.assign(S, { mobile: true, frame: innerWidth > 600 });
  S.state = n;
  history.replaceState(null, "", route());
  render();
}
