function renderSide() {
  const open = tasks().filter((t) => !t.it.checked);
  const todayN = open.filter((t) => t.it.due != null && t.it.due <= 0).length + D.notes.filter((n) => n.day === 0).length;
  const on = (v, extra = true) => S.view === v && extra ? "on" : "";
  const nbCount = (id) => D.notes.filter((n) => n.nb === id || nbById[n.nb].parent === id).length;
  const nbs = D.notebooks.filter((b) => !b.parent).flatMap((b) => [b, ...D.notebooks.filter((c) => c.parent === b.id)]);
  const pend = S.offline ? 3 : 0;
  return `
  <div class="brand"><span class="brand-mark"></span>Barkever</div>
  <div class="nav">
    <button class="nav-i ${on("home")}" data-nav="home">${ic.home}<span class="lbl">Home</span><span class="n">${todayN} today</span></button>
    <button class="nav-i ${on("board", S.board === "all")}" data-nav="board">${ic.board}<span class="lbl">Board</span><span class="n">${open.length}</span></button>
    <button class="nav-i ${on("notes", S.ctx.kind === "all")}" data-ctx="all">${ic.notes}<span class="lbl">All notes</span><span class="n">${D.notes.length}</span></button>
    <div class="nav-h">Projects</div>
    ${D.projects.map((p) => { const st = projectStats(p.id); return `<button class="nav-i ${(S.view === "board" && S.board === p.id) || (S.view === "notes" && S.ctx.kind === "project" && S.ctx.id === p.id) ? "on" : ""}" data-board="${p.id}"><i class="dot pc${p.hue}"></i><span class="lbl">${esc(p.name)}</span><span class="minibar pc${p.hue}" title="${st.done}/${st.total} done"><i style="width:${st.total ? (st.done / st.total) * 100 : 0}%"></i></span></button>`; }).join("")}
    <div class="nav-h">Notebooks</div>
    ${nbs.map((b) => `<button class="nav-i ${b.parent ? "sub" : ""} ${S.view === "notes" && S.ctx.kind === "nb" && S.ctx.id === b.id ? "on" : ""}" data-nb="${b.id}">${b.id === "fx-nb-inbox" ? ic.inbox : ic.book}<span class="lbl">${esc(b.name)}</span><span class="n">${nbCount(b.id)}</span></button>`).join("")}
  </div>
  <div class="sync ${S.offline ? "off" : ""}"><i class="dot"></i>${S.offline ? `Offline · ${pend} changes waiting` : "Synced · just now"}</div>`;
}
