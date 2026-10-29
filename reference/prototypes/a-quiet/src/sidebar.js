const OPEN_STACKS = new Set(["fx-nb-work"]);
const NAV = [["home", "home", "Home"], ["shortcuts", "star", "Shortcuts"], ["notes", "notes", "Notes"], ["tasks", "task", "Tasks"], ["files", "file", "Files"], ["calendar", "cal", "Calendar"], ["templates", "tpl", "Templates"]];

function navHTML([key, icon, label]) {
  const counts = { shortcuts: META.shortcuts.length, notes: NOTES.length, tasks: NOTES.flatMap(tasksOf).filter((t) => !t.it.checked).length };
  const on = S.view === key && !S.q && !S.tag && !(key === "notes" && S.nb);
  const count = counts[key] ? `<span class="count">${counts[key]}</span>` : "";
  return `<div class="nav ${on ? "on" : ""}" data-view="${key}">${ic(icon)}<span class="lbl">${label}</span>${count}</div>`;
}

function notebookHTML(b, sub = false) {
  const kids = NBS.filter((k) => k.parent === b._id), stack = kids.length > 0, open = OPEN_STACKS.has(b._id);
  const count = stack ? notesIn(b._id).length : NOTES.filter((n) => n.notebook._ref === b._id).length;
  const on = S.view === "notes" && !S.q && !S.tag && S.nb === b._id;
  const twisty = stack ? `<span class="tw" data-tw="${b._id}">${ic(open ? "down" : "right")}</span>` : sub ? "" : `<span class="tw"></span>`;
  const row = `<div class="nav ${sub ? "sub" : ""} ${on ? "on" : ""}" data-nb="${b._id}">${twisty}${ic(stack ? "stack" : "book")}
    <span class="lbl">${esc(b.name)}</span><span class="count">${count}</span></div>`;
  return row + (stack && open ? kids.map((k) => notebookHTML(k, true)).join("") : "");
}

function renderSidebar() {
  const recent = sortRecent(NOTES).slice(0, 4).map((n) => `<div class="nav recent" data-open="${n._id}">${ic("clock")}<span class="lbl">${esc(n.title || "Untitled")}</span></div>`);
  const sync = S.offline ? `<span class="dot off"></span>Offline · 3 edits waiting` : `<span class="dot"></span>Synced · just now`;
  $("#sb").innerHTML = `
    <div class="acct"><span class="avatar">OT</span><span>${esc(META.user)}</span><button class="ib" title="Settings">${ic("more")}</button></div>
    <label class="search">${ic("search")}<input id="q" placeholder="Search" value="${esc(S.q)}" autocomplete="off" spellcheck="false"><span class="kbd">⌘K</span></label>
    <button class="new" data-act="new">${ic("plus")}<span>Note</span><span class="kbd">N</span></button>
    <div class="sb-scroll">${NAV.map(navHTML).join("")}
      <div class="sec"><div class="sec-h"><span class="caps">Recent</span></div>${recent.join("")}</div>
      <div class="sec"><div class="sec-h"><span class="caps">Notebooks</span><button class="ib" title="New notebook">${ic("plus")}</button></div>
        ${NBS.filter((b) => !b.parent).map((b) => notebookHTML(b)).join("")}</div>
    </div>
    <div class="sb-foot">${sync}</div>`;
}
