const isMobile = () => S.frame || window.innerWidth <= 700;

function renderOffline() {
  $("#offline").innerHTML = S.offline
    ? `<div class="offline">${ic("cloudoff")}<b>Offline.</b> Changes are saved on this Mac and sync when you reconnect · 3 edits waiting
       <button class="btn sm ghost" data-act="reconnect">Reconnect</button></div>`
    : "";
}

function renderStates() {
  const btn = ([k, l]) => `<button class="${S.s === k ? "on" : ""}" data-state="${k}" title="${k} · ${l}">${k}</button>`;
  $("#states").innerHTML = `<span class="l">State</span>${STATES.map(btn).join("")}<button data-act="theme" title="Light / dark (T)">${ic("moon")}</button>`;
}

function renderTabbar() {
  const tab = (v, icon, l) => `<button class="tab ${S.view === v ? "on" : ""}" data-view="${v}">${ic(icon)}${l}</button>`;
  $("#tabbar").innerHTML = tab("home", "home", "Home") + tab("notes", "notes", "Notes")
    + `<button class="plus" data-act="new" title="New note">${ic("plus")}</button>`
    + tab("tasks", "task", "Tasks") + tab("shortcuts", "star", "Shortcuts");
}

function keepSelectionVisible() {
  if (WIDE.has(S.view)) return;
  const list = currentList();
  const pinned = S.scr === "note" && byId[S.note];
  if (list.length && !pinned && !list.some((n) => n._id === S.note)) S.note = list[0]._id;
}

function render() {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = S.theme || (dark ? "dark" : "light");
  const app = $("#app"), m = isMobile();
  app.classList.toggle("wide", WIDE.has(S.view));
  app.classList.toggle("m", m);
  app.classList.toggle("scr-note", m && S.scr === "note");
  app.classList.toggle("scr-list", m && S.scr !== "note");
  app.classList.toggle("drawer", m && S.drawer);
  document.body.classList.toggle("framed", S.frame && window.innerWidth > 700);
  document.body.classList.toggle("noui", S.noui);
  keepSelectionVisible();
  const q = document.activeElement?.id === "q" ? document.activeElement.selectionStart : null;
  renderOffline(); renderSidebar(); renderList(); renderEditor(); renderWide(); renderStates(); renderTabbar();
  if (q !== null) { $("#q").focus(); $("#q").setSelectionRange(q, q); }
  $(".row.on")?.scrollIntoView({ block: "nearest" });
}
