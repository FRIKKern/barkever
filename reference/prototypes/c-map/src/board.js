function renderBoard() {
  const lists = NOTES.flatMap((n) => n.body.blocks.filter((b) => b.task).map((b) => ({ n, b })));
  const all = lists.flatMap((l) => l.b.items), open = all.filter((i) => !i.checked).length;
  let h = `<div class="bar board-h"><b>Tasks</b><span class="muted">${open} open · ${all.length - open} done · from ${lists.length} checklists. Ticking here ticks the note.</span></div><div class="cols">`;
  for (const nb of NB) {
    const mine = lists.filter((l) => l.n.notebook._ref === nb._id).sort((x, y) => y.n._updated - x.n._updated);
    if (!mine.length) continue;
    const items = mine.flatMap((l) => l.b.items), done = items.filter((i) => i.checked).length;
    h += `<div class="col"><div class="col-h">${nbDot(nb._id)}${esc(nb.name)}<span class="n">${items.length - done} open</span></div><div class="prog"><i style="width:${(done / items.length) * 100}%;background:${nbColor(nb._id)}"></i></div>`;
    for (const { n, b } of mine) {
      h += `<div class="card"><button class="card-t" data-open="${n._id}">${esc(n.title)}</button>` + b.items.map((it, i) => `<div class="tk${it.checked ? " done" : ""}"><span class="cb" role="checkbox" aria-checked="${!!it.checked}" data-tick="${n._id}|${b.id}|${i}"></span><span class="tt">${esc(inlineText(it.content))}</span><button class="go" data-open="${n._id}" data-line="${b.id}|${i}" title="Open at this line">↗ line</button></div>`).join("") + `</div>`;
    }
    h += `</div>`;
  }
  $("#board").innerHTML = h + `</div>`;
}
