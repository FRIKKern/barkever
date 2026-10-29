const EMPTY = {
  home: ["home", "Home", "Recent notes, shortcuts and open tasks gather here as you write."],
  files: ["file", "Files", "No files yet. Drag an image or PDF into any note."],
  calendar: ["cal", "Calendar", "No events yet. Connect a calendar to see meetings next to their notes."],
  templates: ["tpl", "Templates", "No templates yet. Save any note as a template from its ⋯ menu."],
};

function wideHead(title, sub, right = "") {
  return `<div class="mtop m-only"><button class="ib" data-act="drawer">${ic("menu")}</button></div>
    <div class="wide-h"><div><h1>${title}</h1><div class="sub">${sub}</div></div><div class="right">${right}</div></div>`;
}

function renderWide() {
  const w = $("#wide");
  if (!WIDE.has(S.view)) { w.innerHTML = ""; return; }
  if (S.view === "tasks") { w.innerHTML = tasksHTML(); return; }
  const [icon, title, line] = EMPTY[S.view];
  w.innerHTML = wideHead(title, "") + `<div class="wide-body"><div class="empty" style="margin-top:80px">${ic(icon)}${line}</div></div>`;
}
