$("#q").addEventListener("input", (e) => { S.q = e.target.value; S.state = 0; render(); });
$("#q").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && S.view !== "notes") go({ view: "notes", ctx: { kind: "all" }, mpane: "list" });
  if (e.key === "Escape") { S.q = e.target.value = ""; e.target.blur(); render(); }
});

document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, [contenteditable=true]")) {
    if (e.key === "Escape") e.target.blur();
    return;
  }
  if (/^[1-8]$/.test(e.key) && !e.metaKey && !e.ctrlKey) return applyState(+e.key);
  if (e.key === "Escape") { if (S.ask) S.ask = false; else S.ai = null; return render(); }
  if (S.view !== "notes" || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
  e.preventDefault();
  const list = ctxNotes();
  const i = list.findIndex((n) => n.id === S.noteId) + (e.key === "ArrowDown" ? 1 : -1);
  const next = list[Math.max(0, Math.min(list.length - 1, i))];
  if (next) selectNote(next.id);
});

document.addEventListener("input", (e) => {
  const t = e.target, n = byId[S.noteId];
  if (!n || !t.isContentEditable) return;
  if (t.dataset.title) n.title = t.textContent;
  if (t.dataset.para) n.blocks.find((b) => b.id === t.dataset.para).content = domInline(t);
  if (t.dataset.item) taskByKey(t.dataset.item).it.content = [{ type: "text", value: t.textContent }];
  n.edited = 0;
  const row = $(`.nrow[data-note="${n.id}"]`);
  if (!row) return;
  $(".t", row).textContent = n.title || "Untitled";
  $(".s", row).textContent = snippet(n);
  $(".d", row).textContent = "just now";
});

const domInline = (el) => [...el.childNodes].map((nd) => nd.dataset?.link
  ? { type: "wikilink", target: nd.dataset.link, docId: nd.dataset.link, children: [{ type: "text", value: nd.textContent }] }
  : { type: "text", value: nd.textContent });
