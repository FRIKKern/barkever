function renderMobile() {
  const app = $("#app"), m = isMobile();
  app.classList.toggle("m", m); app.dataset.mv = S.mv;
  if (!m) return;
  const nbName = S.nb === "all" ? "All notes" : nbById[S.nb].name;
  const titles = { tasks: "Tasks", ask: "Ask", list: nbName };
  $("#mhead").innerHTML = S.mv === "note"
    ? `<button class="back" data-act="mback">${ICON.back}${esc(nbName)}</button><span class="mt"></span><button class="ic" data-act="aiedit" aria-label="AI Edit">✨</button><button class="ic" data-act="openmap" aria-label="Map">${ICON.map}</button>`
    : `<span class="mt" style="text-align:left">${esc(titles[S.mv])}</span>`;
  const tab = (k, ic, label) => `<button class="${S.mv === k || (k === "list" && S.mv === "note") ? "on" : ""}" data-mtab="${k}">${ic}${label}</button>`;
  $("#tabbar").innerHTML = tab("list", ICON.notes, "Notes") + tab("tasks", ICON.tasks, "Tasks") + `<button data-act="openmap">${ICON.map}Map</button>` + tab("ask", ICON.ask, "Ask");
}

function render(forceEditor) {
  const app = $("#app");
  app.classList.toggle("v-tasks", S.view === "tasks");
  app.classList.toggle("is-offline", S.offline);
  renderMobile(); renderSidebar(); renderList();
  if (S.view === "tasks") renderBoard(); else { renderEditor(forceEditor); renderRail(true); }
  renderMap(); renderSwitcher();
}
function refreshAll() { renderEditor(true); renderRail(true); renderList(); renderSidebar(); }

function openNote(id, opts = {}) {
  S.noteId = id; S.view = "notes"; S.tipId = null;
  if (!S.query && !S.visible.includes(id)) S.nb = byId[id].notebook._ref;
  if (isMobile()) S.mv = "note";
  render(true);
  $(`.row[data-open="${id}"]`)?.scrollIntoView({ block: "nearest" });
  if (opts.quote || opts.line) requestAnimationFrame(() => flashIn(opts));
}

function flashIn({ quote, line }) {
  let el;
  if (line) { const [bid, i] = line.split("|"); el = $(`#body [data-block="${bid}"] li[data-i="${i}"]`); }
  else el = $$("#body > *").find((b) => b.textContent.includes(quote.slice(0, 24)));
  if (!el) return;
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  el.scrollIntoView({ block: "center" });
}

function setNb(nb) {
  S.nb = nb; S.query = ""; $("#q").value = ""; S.view = "notes";
  if (isMobile()) S.mv = "list"; else S.noteId = listNotes()[0]?._id || S.noteId;
  render();
}

function move(d) {
  const v = S.visible, i = v.indexOf(S.noteId);
  const j = i < 0 ? 0 : Math.min(Math.max(i + d, 0), v.length - 1);
  if (v[j] && v[j] !== S.noteId) openNote(v[j]);
}

function tick(nid, bid, i) {
  const it = byId[nid].body.blocks.find((b) => b.id === bid).items[+i];
  it.checked = !it.checked;
  changed(byId[nid]);
  return it.checked;
}

let toastT = 0;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600);
}

function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("c-map-theme", t); } catch (e) {} }
const toggleTheme = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");

const ACTIONS = {
  tasks: () => { S.view = "tasks"; if (isMobile()) S.mv = "tasks"; render(); },
  openmap: openMap,
  closemap: closeMap,
  mapopen: () => { const id = S.mapSel; closeMap(); openNote(id); },
  zfit: () => { S.vb = null; renderMap(); },
  theme: toggleTheme,
  aiedit: () => { startAIEdit(S.noteId, "Tighten the summary and link related notes"); refreshAll(); },
  accall: () => { S.ai.changes.filter((c) => c.status === "pending").forEach((c) => resolveChange(c.i, true)); refreshAll(); },
  rejall: () => { S.ai.changes.filter((c) => c.status === "pending").forEach((c) => resolveChange(c.i, false)); refreshAll(); },
  aiundo: undoAI,
  aidone: () => { S.ai = null; refreshAll(); toast("AI Edit applied."); },
  mback: () => { S.mv = "list"; render(); },
  morelinks: () => $(".rel")?.scrollIntoView({ block: "start", behavior: "smooth" }),
};

document.addEventListener("click", (e) => {
  const t = e.target, at = (sel) => t.closest(sel);
  let el;
  if ((el = at("[data-tick]"))) { const done = tick(...el.dataset.tick.split("|")); el.closest(".tk").classList.toggle("done", done); el.setAttribute("aria-checked", done); renderSidebar(); return; }
  if ((el = at("#body .cb"))) { const li = el.closest("li"); li.classList.toggle("done", tick(S.noteId, li.parentElement.dataset.block, li.dataset.i)); return; }
  if ((el = at("[data-state]"))) return applyState(+el.dataset.state);
  if ((el = at("[data-acc]"))) { resolveChange(+el.dataset.acc, true); return refreshAll(); }
  if ((el = at("[data-rej]"))) { resolveChange(+el.dataset.rej, false); return refreshAll(); }
  if ((el = at("[data-keep]"))) return resolveConflict(el.dataset.keep);
  if ((el = at("[data-askq]"))) { S.ask.push({ q: el.dataset.askq, a: answer(el.dataset.askq) }); return renderAsk(); }
  if ((el = at("[data-zoomnb]"))) { const b = MAP.boxes[el.dataset.zoomnb]; fitVB({ x: b.x - 40, y: b.y - 40, w: b.w + 80, h: b.h + 80 }); return renderMap(); }
  if ((el = at("[data-mapsel]"))) { S.mapSel = el.dataset.mapsel; return renderMap(); }
  if ((el = at("[data-mtab]"))) {
    S.mv = el.dataset.mtab; S.view = S.mv === "tasks" ? "tasks" : "notes";
    S.rail = S.mv === "ask" ? "ask" : S.rail === "ask" ? "links" : S.rail;
    return render();
  }
  if ((el = at("[data-rail]"))) { S.rail = el.dataset.rail; S.tipId = null; return renderRail(false); }
  if ((el = at("[data-nb]"))) return setNb(el.dataset.nb);
  if ((el = at("[data-open]")) && !at("#body")) { if (S.map) closeMap(); return openNote(el.dataset.open, { quote: el.dataset.quote, line: el.dataset.line }); }
  if ((el = at("[data-act]")) && ACTIONS[el.dataset.act]) ACTIONS[el.dataset.act]();
});

document.addEventListener("change", (e) => { if (e.target.dataset.act === "aitoggle") { S.aiOn = e.target.checked; renderAsk(); } });

document.addEventListener("mousedown", (e) => { const w = e.target.closest(".doc .wl"); if (w) { e.preventDefault(); openNote(w.dataset.id); } });

document.addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#askq").value.trim(); if (!q) return;
  S.ask.push({ q, a: answer(q) }); renderAsk();
  $("#askq").focus(); $("#rail").scrollTop = 1e6;
});

document.addEventListener("input", (e) => {
  const id = e.target.id;
  if (id === "q") {
    S.query = e.target.value; renderList();
    if (S.visible.length && !S.visible.includes(S.noteId)) { S.noteId = S.visible[0]; renderEditor(); renderRail(true); renderList(); }
  }
  if (id === "title") { byId[S.noteId].title = e.target.textContent; changed(byId[S.noteId]); }
  if (id === "body") syncBody();
});

document.addEventListener("mouseover", (e) => { const w = e.target.closest(".wl[data-id], .rel-row"); if (w) hoverGraph(w.dataset.id || w.dataset.open); });
document.addEventListener("mouseout", (e) => { const w = e.target.closest(".wl[data-id], .rel-row"); if (w && !w.contains(e.relatedTarget)) hoverGraph(null); });

document.addEventListener("keydown", (e) => {
  const t = e.target, typing = t.isContentEditable || /INPUT|TEXTAREA/.test(t.tagName);
  if ((e.metaKey || e.ctrlKey) && e.key === "z" && S.ai && !typing) { e.preventDefault(); return undoAI(); }
  if (e.key === "Escape") return S.map ? closeMap() : typing && t.blur();
  if (t.id === "title" && e.key === "Enter") { e.preventDefault(); return $("#body").focus(); }
  if (typing && !(t.id === "q" && /^(ArrowUp|ArrowDown)$/.test(e.key))) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^[1-9]$/.test(e.key)) return applyState(+e.key);
  if (S.map) { if (e.key === "Enter" && S.mapSel) ACTIONS.mapopen(); return; }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); return move(e.key === "ArrowDown" ? 1 : -1); }
  if (e.key === "Enter") { e.preventDefault(); return $("#body")?.focus(); }
  if (e.key === "/") { e.preventDefault(); return $("#q").focus(); }
  if (e.key === "m") return openMap();
  if (e.key === "t") return toggleTheme();
});

addEventListener("resize", () => { renderMobile(); if (S.map) { S.vb = null; renderMap(); } });
