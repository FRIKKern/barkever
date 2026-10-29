function taskItemHTML(t) {
  const done = t.it.checked ? "done" : "";
  return `<div class="titem ${done}">
    <button class="cb ${t.it.checked ? "on" : ""}" data-check="${t.n._id}|${t.b.id}|${t.i}">${ic("check")}</button>
    <span>${inlineHTML(t.it.content)}</span>
    <span class="go" data-line="${t.n._id}|${t.b.id}:${t.i}" title="Open the line in its note">${ic("open")}</span></div>`;
}

function taskCardHTML(n) {
  const ts = tasksOf(n);
  const done = ts.filter((t) => t.it.checked).length;
  const shown = S.tf === "open" ? ts.filter((t) => !t.it.checked) : ts;
  return `<div class="tcard">
    <div class="h"><a data-open="${n._id}">${esc(n.title)}</a><span class="n">${done}/${ts.length}</span></div>
    <div class="m">${esc(nbName(n.notebook._ref))} · ${shortDate(n.updated)}</div>
    <span class="bar"><i style="width:${(done / ts.length) * 100}%"></i></span>
    ${shown.map(taskItemHTML).join("") || `<div class="titem muted">All done</div>`}</div>`;
}

function tasksHTML() {
  const all = NOTES.flatMap(tasksOf);
  const open = all.filter((t) => !t.it.checked).length;
  const sources = sortRecent(NOTES.filter((n) => tasksOf(n).length));
  const cols = NBS.filter((b) => !b.parent)
    .map((b) => ({ b, notes: sources.filter((n) => notesIn(b._id).includes(n)) }))
    .filter((c) => c.notes.length);
  const seg = ["open", "all"].map((f) => `<button data-tf="${f}" class="${S.tf === f ? "on" : ""}">${f === "open" ? "Open" : "All"}</button>`).join("");
  const sub = `<span>${open} open · ${all.length - open} done · from ${sources.length} notes</span>
    <span class="bar" style="width:120px"><i style="width:${((all.length - open) / all.length) * 100}%"></i></span>`;
  const col = (c) => {
    const openHere = c.notes.flatMap(tasksOf).filter((t) => !t.it.checked).length;
    const icon = NBS.some((k) => k.parent === c.b._id) ? "stack" : "book";
    return `<div><div class="col-h">${ic(icon)}${esc(c.b.name)}<span class="count">${openHere} open</span></div>
      <div class="col">${c.notes.map(taskCardHTML).join("")}</div></div>`;
  };
  return wideHead("Tasks", sub, `<div class="seg">${seg}</div><span class="muted" style="font-size:var(--fs-sm)">Grouped by notebook</span>`)
    + `<div class="wide-body"><div class="board">${cols.map(col).join("")}</div></div>`;
}
