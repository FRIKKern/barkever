function renderBoard(main) {
  const withTasks = notes.filter((n) => n.tasks.total).sort((a, b) => b.updated - a.updated);
  const shown = withTasks;
  const items = (n, done) => n.blocks.filter((b) => b.task).flatMap((b) => b.items.map((it, i) => ({ b, it, i })).filter((x) => !!x.it.checked === done));
  const tcard = (n, done) => {
    const its = items(n, done); if (!its.length) return "";
    return `<div class="tcard"><button class="tcard-h" data-go="${n.id}">${shapeSVG(n, .82)}<span class="t">${esc(n.title)}</span><span class="p">${progress(n)}</span></button>
      ${its.map(({ b, it, i }) => `<div class="titem ${done ? "done" : ""}"><button class="cb ${done ? "on" : ""}" data-toggle="${n.id}|${b.id}|${i}" aria-label="Toggle">${done ? ico("check") : ""}</button>
        <button class="txt" data-line="${n.id}|${b.id}-${i}" title="Open the line in its note">${esc(inlineText(itemContent(it)))}</button><span class="jump">${ico("jump", "ico-s")}</span></div>`).join("")}
      <div class="tnb">${esc(nbById[n.nb].name)}</div></div>`;
  };
  const openN = shown.reduce((a, n) => a + n.tasks.total - n.tasks.done, 0), doneN = shown.reduce((a, n) => a + n.tasks.done, 0);
  main.innerHTML = `<div class="board">
    <div class="board-head"><h1>Tasks</h1><span class="sub">from checklists in ${shown.length} notes · each links back to its line</span></div>
    <div class="cols">
      <section class="col"><div class="col-h">To do <span class="count num">${openN}</span></div><div class="col-grid">${shown.map((n) => tcard(n, false)).join("")}</div></section>
      <section class="col done"><div class="col-h">Done <span class="count num">${doneN}</span></div><div class="col-grid">${shown.map((n) => tcard(n, true)).join("")}</div></section>
    </div></div>`;
}
