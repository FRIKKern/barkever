const COLS = [["later", "Later"], ["week", "This week"], ["today", "Today"], ["done", "Done"]];
function renderBoard() {
  const all = tasks().filter((t) => matchQ(t.n, t.text));
  const pills = `<div class="pills"><button class="pill ${S.board === "all" ? "on" : ""}" data-board="all">All projects</button>${D.projects.map((p) => `<button class="pill ${S.board === p.id ? "on" : ""}" data-board="${p.id}"><i class="dot pc${p.hue}"></i>${esc(p.name)}</button>`).join("")}</div>`;
  const cell = (ts, c, limitDone = true) => {
    let items = ts.filter((t) => boardCol(t) === c).sort((a, b) => (a.it.due ?? 99) - (b.it.due ?? 99));
    let more = "";
    if (c === "done" && limitDone && items.length > 3) { more = `<div class="more">+${items.length - 3} more done</div>`; items = items.slice(0, 3); }
    return items.map((t) => taskRow(t, { cls: "card" })).join("") + more;
  };
  const head = (ts) => COLS.map(([c, l]) => `<div class="bh c-${c}">${l} <span>${ts.filter((t) => boardCol(t) === c).length}</span></div>`).join("");
  if (S.board === "all") {
    const rows = D.projects.map((p) => {
      const ts = all.filter((t) => t.n.project === p.id), st = projectStats(p.id);
      return `<div class="bl pc${p.hue}"><b data-board="${p.id}"><i class="dot"></i>${esc(p.name)}</b>${pbar(st, p.hue)}<small>${st.done}/${st.total} done · ${st.notes} notes</small></div>` +
        COLS.map(([c]) => `<div class="bc c-${c}">${cell(ts, c)}</div>`).join("");
    }).join("");
    return `<div class="board" data-keep="board"><div class="board-head"><h1>Board</h1>${pills}<span class="hint">Each card is a checklist line in a note · tick to finish</span></div>
      <div class="bgrid" style="grid-template-columns: 168px repeat(4, minmax(0, 1fr))"><div class="bh"></div>${head(all)}${rows}</div></div>`;
  }
  const p = prById[S.board], ts = all.filter((t) => t.n.project === p.id), st = projectStats(p.id);
  const pn = D.notes.filter((n) => n.project === p.id).sort((a, b) => b.edited - a.edited);
  return `<div class="board" data-keep="board"><div class="board-head"><h1>${esc(p.name)}</h1>${pills}<span class="hint">${st.done}/${st.total} done</span></div>
    <div class="single">${head(ts)}<div class="bh" style="border-left:1px solid var(--line)">Notes <span>${pn.length}</span></div>
    ${COLS.map(([c]) => `<div class="bc c-${c}">${cell(ts, c, false) || `<div class="empty">${c === "later" && !st.total ? "Type [ ] in a project note to add a task" : "—"}</div>`}</div>`).join("")}
    <div class="pnotes">${pn.map((n) => noteRow(n, editedLabel(n.edited))).join("")}<button class="btn sm" data-ctx-project="${p.id}" style="margin:6px 4px">Open as list →</button></div></div></div>`;
}
