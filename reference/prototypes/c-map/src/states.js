const STATES = ["Browse a notebook", "Note open with its link graph", "✨ Ask with citations", "AI Edit diff", "Tasks board", "Offline", "Conflict", "Mobile ≈390 px", "Full map"];
const BASE = JSON.stringify(NOTES);
const DEFAULTS = JSON.stringify(S);

const SETUP = {
  1: { nb: "fx-nb-projects", noteId: "fx-note-02", rail: "cluster" },
  2: { nb: "fx-nb-projects", noteId: "fx-note-01", tipId: "fx-note-40" },
  3: { nb: "fx-nb-meetings", noteId: "fx-note-10", rail: "ask", ask: [{ q: "What did we decide about the carousel?", a: PRESET.carousel }, { q: "When is my dentist appointment?", a: PRESET.dentist }] },
  4: { nb: "fx-nb-projects", noteId: "fx-note-00" },
  5: { view: "tasks" },
  6: { nb: "fx-nb-inbox", noteId: "fx-note-24", offline: true, pending: 3 },
  7: { nb: "fx-nb-home", noteId: "fx-note-30" },
  8: { nb: "fx-nb-projects", noteId: "fx-note-01", mv: "note" },
  9: { nb: "fx-nb-projects", noteId: "fx-note-00" },
};

function applyState(k) {
  NOTES.length = 0;
  for (const n of JSON.parse(BASE)) { n._updated = new Date(n._updated); NOTES.push(n); }
  for (const key of Object.keys(byId)) delete byId[key];
  for (const n of NOTES) byId[n._id] = n;
  computeMap();
  Object.assign(S, JSON.parse(DEFAULTS), SETUP[k], { stateN: k });
  S.forced = k === 8 && !matchMedia("(max-width: 700px)").matches;
  document.body.classList.toggle("frame", S.forced);
  if (k === 4) startAIEdit("fx-note-00", "Tighten the summary and link the content plan");
  if (k === 7) S.conflict = makeConflict();
  $("#q").value = ""; $("#mq").value = ""; LG.pos = {};
  $("#pending").textContent = S.pending ? `${S.pending} edits waiting` : "";
  S.visible = listNotes().map((n) => n._id);
  render(true);
  if (k === 9) openMap();
  $("#app").scrollTop = 0;
}

function renderSwitcher() {
  $("#switcher").innerHTML = STATES.map((t, i) => `<button data-state="${i + 1}" class="${S.stateN === i + 1 ? "on" : ""}" title="${i + 1} · ${esc(t)}">${i + 1}</button>`).join("");
}

(function boot() {
  const params = new URLSearchParams(location.search);
  let theme = params.get("theme");
  try { theme ||= localStorage.getItem("c-map-theme"); } catch (e) {}
  document.documentElement.dataset.theme = theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  wireMap();
  applyState(+params.get("s") || 2);
})();
