function renderHome() {
  const all = tasks().filter((t) => matchQ(t.n, t.text));
  const open = all.filter((t) => !t.it.checked);
  const notes = datedNotes().filter((x) => matchQ(x.n));
  const by = (lane) => open.filter((t) => laneOf(t) === lane).sort((a, b) => a.it.due - b.it.due);
  const today = by("today").sort((a, b) => a.it.due - b.it.due || (a.n.project || "").localeCompare(b.n.project || ""));
  const todayNotes = notes.filter((x) => x.n.day <= 0);
  const late = today.filter((t) => t.it.due < 0).length;
  const week = by("week"), weekNotes = notes.filter((x) => x.n.day >= 1 && x.n.day <= 6);
  const nextW = [...by("next")], laterW = [...by("later")], none = by("none");
  const doneToday = all.filter((t) => t.it.checked && t.it.done === 0).length;

  const load = Array.from({ length: 14 }, (_, d) => open.filter((t) => t.it.due != null && (d === 0 ? t.it.due <= 0 : t.it.due === d)).length + notes.filter((x) => x.n.day === d).length);
  const max = Math.max(4, ...load);
  const loadHtml = `<div class="loadbox"><div class="load-cap">Next<br>14 days</div><div class="load" title="Open items per day">${load.map((n, d) => `<div class="load-d ${d === 0 ? "t" : ""} ${isWe(d) ? "we" : ""}" title="${dShort(d)}: ${n} open"><i style="height:${Math.max(2, (n / max) * 26)}px"></i>${WD[day(d).getDay()][0]}</div>`).join("")}</div></div>`;

  const tiles = D.projects.map((p) => {
    const st = projectStats(p.id);
    const nx = st.next ? `next <b>${esc(st.next.text)}</b> · ${dueLabel(st.next.it.due)}` : st.total ? "all done" : "no checklists yet";
    return `<button class="ptile" data-board="${p.id}"><div class="pt-h"><i class="dot pc${p.hue}"></i><b>${esc(p.name)}</b><span>${st.done}/${st.total}</span></div>${pbar(st, p.hue)}<div class="pt-s">${nx}</div></button>`;
  }).join("");

  const col = (title, sub, items, cls = "") => `<div class="col ${cls} ${items.length ? "" : "empty-col"}"><div class="col-h"><b>${title}</b>${sub}<span class="n">${items.length || ""}</span></div>${items.join("") || `<div class="empty">—</div>`}</div>`;
  const days = Array.from({ length: 6 }, (_, i) => i + 1).map((d) => col(WD[day(d).getDay()], `<span>${day(d).getDate()}</span>`, [...week.filter((t) => t.it.due === d).map((t) => taskRow(t, { meta: "" })), ...weekNotes.filter((x) => x.n.day === d).map((x) => noteRow(x.n))], isWe(d) ? "we" : "")).join("");
  const notesLater = notes.filter((x) => x.n.day > 6);
  const buckets = [
    col("Next week", `<span>${dLong(7)}–${dLong(13)}</span>`, [...nextW.map((t) => taskRow(t)), ...notesLater.filter((x) => x.n.day <= 13).map((x) => noteRow(x.n, dueLabel(x.n.day)))]),
    col("Later", `<span>from ${dLong(14)}</span>`, [...laterW.map((t) => taskRow(t)), ...notesLater.filter((x) => x.n.day > 13).map((x) => noteRow(x.n, dueLabel(x.n.day)))]),
    col("No date", "", none.map((t) => taskRow(t))),
  ].join("");
  const qn = S.q ? D.notes.filter((n) => matchQ(n)).length : 0;
  const weekN = week.length + weekNotes.length, laterN = nextW.length + laterW.length + none.length + notesLater.length;

  return `<div class="home" data-keep="home">
    <div class="home-head"><div><h1>${WD[day(0).getDay()].replace("Thu", "Thursday")} ${dLong(0).replace("Oct", "October")}</h1>
      <p class="sub"><b>${today.length + todayNotes.length}</b> for today${late ? ` · <span class="late">${late} late</span>` : ""} · <b>${weekN}</b> this week · <b>${doneToday}</b> done today</p></div>${loadHtml}</div>
    ${S.q ? `<div class="filterline">Lanes filtered by “${esc(S.q)}” · ${qn} matching notes · <button data-act="q-list">open as list</button> · <button data-act="q-clear">clear</button></div>` : ""}
    <div class="sec-h">Projects <em>· click for its board</em></div>
    <div class="ptiles">${tiles}</div>
    <div class="lanes">
      <div class="lane lane-today"><div class="lane-l"><b>Today <span>${today.length + todayNotes.length}</span></b><small>${dShort(0)} ${MO[day(0).getMonth()]}</small></div>
        <div class="lane-c"><div class="today-grid">${[...today.map((t) => taskRow(t, { meta: "late" })), ...todayNotes.map((x) => noteRow(x.n, "note"))].join("")}</div></div></div>
      <div class="lane"><div class="lane-l"><b>This week <span>${weekN}</span></b><small>${dLong(1)} – ${dLong(6)}</small></div><div class="lane-c cols days">${days}</div></div>
      <div class="lane"><div class="lane-l"><b>Later <span>${laterN}</span></b><small>from ${dLong(7)}</small></div><div class="lane-c cols buckets">${buckets}</div></div>
    </div></div>`;
}
