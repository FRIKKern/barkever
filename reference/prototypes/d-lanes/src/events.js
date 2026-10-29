function tick(key) {
  const t = taskByKey(key);
  t.it.checked = !t.it.checked;
  if (t.it.checked) t.it.done = 0;
  else { delete t.it.done; t.it.due ??= 0; }
  t.n.edited = 0;
  render();
}

function keepConflict(side) {
  const n = byId[CONFLICT.id];
  const takeOther = (blocks) => blocks.forEach((b) => {
    const o = CONFLICT.otherBlocks[b.id.replace(/-b$/, "")];
    if (o) b.content = [{ type: "text", value: o }];
    if (b.task) Object.entries(CONFLICT.otherChecks).forEach(([i, v]) => (b.items[i].checked = v));
  });
  if (side === "other") takeOther(n.blocks);
  if (side === "both") {
    const copy = structuredClone(n);
    copy.id += "-b";
    copy.title += " (iPhone)";
    copy.blocks.forEach((b) => (b.id += "-b"));
    takeOther(copy.blocks);
    D.notes.push(copy);
    byId[copy.id] = copy;
  }
  S.conflict = null;
  toast(side === "both" ? "Kept both versions as two notes" : "Kept one version");
}

const ACTS = {
  ask: () => { S.ask = !S.ask; S.state = 0; },
  "ask-close": () => { S.ask = false; },
  "ai-toggle": () => { S.aiOn = !S.aiOn; S.ai = null; },
  "ai-edit": () => { if (S.ai) S.ai = null; else startAiEdit(S.noteId); },
  "ai-ok": (x) => setChange(x.dataset.id, "accepted"),
  "ai-no": (x) => setChange(x.dataset.id, "rejected"),
  "ai-reset": (x) => setChange(x.dataset.id, "pending"),
  "ai-all-ok": () => S.ai.changes.forEach((c) => c.status === "pending" && (c.status = "accepted")),
  "ai-all-no": () => S.ai.changes.forEach((c) => c.status === "pending" && (c.status = "rejected")),
  "ai-done": () => finishAiEdit(),
  undo: () => undoAiEdit(),
  theme: () => { S.theme = S.theme === "dark" ? "light" : "dark"; },
  online: () => { S.offline = false; toast("Back online · 3 changes synced"); },
  "q-clear": () => { S.q = $("#q").value = ""; },
  "q-list": () => go({ view: "notes", ctx: { kind: "all" } }),
  mback: () => go({ mpane: "list" }),
  "cf-keep": (x) => keepConflict(x.dataset.side),
};

document.addEventListener("click", (e) => {
  const at = (s) => e.target.closest(s);
  let x;
  if ((x = at("[data-state]"))) return applyState(+x.dataset.state);
  if ((x = at("[data-tick]"))) return tick(x.dataset.tick);
  if ((x = at("[data-link]"))) return openNote(x.dataset.link);
  if ((x = at("[data-cite]"))) return openNote(x.dataset.cite, x.dataset.blk);
  if ((x = at("[data-act]"))) { ACTS[x.dataset.act]?.(x); return render(); }
  if ((x = at("[data-tab]"))) {
    const v = x.dataset.tab;
    S.ask = v === "ask" ? !S.ask : false;
    return v === "ask" ? render() : go(v === "notes" ? { view: "notes", mpane: "list" } : { view: v, board: "all" });
  }
  if ((x = at("[data-board]"))) return go({ view: "board", board: x.dataset.board });
  if ((x = at("[data-ctx-project]"))) return go({ view: "notes", ctx: { kind: "project", id: x.dataset.ctxProject }, mpane: "list" });
  if ((x = at("[data-nav]"))) return go({ view: x.dataset.nav, board: "all" });
  if ((x = at("[data-ctx]"))) return go({ view: "notes", ctx: { kind: "all" }, mpane: "list" });
  if ((x = at("[data-nb]"))) return go({ view: "notes", ctx: { kind: "nb", id: x.dataset.nb }, mpane: "list" });
  if ((x = at("[data-note]"))) return selectNote(x.dataset.note);
  if ((x = at("[data-open]")) && !at("[contenteditable=true]")) return openNote(x.dataset.open, x.dataset.line);
});

document.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#askq").value.trim();
  if (!q) return;
  S.convo.push(answer(q));
  render();
  $(".ask-b").scrollTop = 1e6;
  $("#askq").focus();
});
