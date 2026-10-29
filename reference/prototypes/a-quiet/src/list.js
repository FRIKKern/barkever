function currentList() {
  if (S.q) return sortRecent(NOTES.filter((n) => matches(n, S.q)));
  if (S.view === "shortcuts") return META.shortcuts.map((id) => byId[id]);
  if (S.tag) return sortRecent(NOTES.filter((n) => n.tags.includes(S.tag)));
  return sortRecent(S.nb ? notesIn(S.nb) : NOTES);
}

function rowHTML(n) {
  const pr = progress(n), bl = (BACK[n._id] || []).length;
  const ind = (pr ? `<span title="Checklist">${ic("task")}${pr.done}/${pr.all}</span>` : "")
    + (bl ? `<span title="Backlinks">${ic("back")}${bl}</span>` : "");
  const snip = hl(esc(snippet(n, S.q)), S.q) || `<span class="muted">No text yet</span>`;
  return `<div class="row ${S.note === n._id ? "on" : ""}" data-row="${n._id}">
    <div class="row-meta"><span class="nb">${esc(nbName(n.notebook._ref))}</span><span>·</span><span>${shortDate(n.updated)}</span><span class="ind">${ind}</span></div>
    <div class="row-t">${hl(esc(n.title || "Untitled"), S.q)}</div>
    <div class="row-s">${snip}</div></div>`;
}

function listTitle(count) {
  if (S.q) return ["Search", plural(count, "result"), `<button class="chip" data-act="clearq">“${esc(S.q)}” ${ic("x")}</button>`];
  if (S.view === "shortcuts") return ["Shortcuts", plural(count, "note"), ""];
  if (S.tag) return ["#" + S.tag, plural(count, "note"), `<button class="chip" data-act="cleartag">tag ${ic("x")}</button>`];
  if (S.nb) return [nbName(S.nb), plural(count, "note"), ""];
  return ["Notes", plural(count, "note"), ""];
}

function rowsHTML(list) {
  if (!list.length) return S.q
    ? `<div class="empty">${ic("search")}No notes match “${esc(S.q)}”. Try fewer words.</div>`
    : `<div class="empty">${ic("note")}No notes here yet. Press <span class="kbd">N</span> to write one.</div>`;
  let last = "";
  return list.map((n) => {
    const g = S.view === "shortcuts" ? "" : groupOf(n.updated);
    const head = g && g !== last ? `<div class="grp caps">${g}</div>` : "";
    last = g;
    return head + rowHTML(n);
  }).join("");
}

function renderList() {
  const list = currentList();
  const [title, sub, chip] = listTitle(list.length);
  $("#list").innerHTML = `
    <div class="mtop m-only"><button class="ib" data-act="drawer" title="Menu">${ic("menu")}</button><button class="ib">${ic("sort")}</button></div>
    <div class="list-h">
      <div class="top"><h1>${esc(title)}</h1><button class="ib d-only" title="Sort: date edited">${ic("sort")}</button><button class="ib d-only" title="View options">${ic("view")}</button></div>
      <div class="sub">${sub}${chip}<span style="margin-left:auto" class="d-only">Date edited</span></div>
      <div class="msearch m-only"><label class="search">${ic("search")}<input data-msearch placeholder="Search notes" value="${esc(S.q)}"></label></div>
    </div>
    <div class="rows">${rowsHTML(list)}</div>`;
}
