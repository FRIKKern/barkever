const S = { view: "notes", nb: null, tag: null, q: "", note: null, s: 0, ask: false, edit: false, offline: false, conflict: false, frame: false, scr: "list", drawer: false, aiOff: false, tf: "open", theme: null, noui: false };
const WIDE = new Set(["home", "tasks", "files", "calendar", "templates"]);
const FLAGS = { a: "ask", e: "edit", o: "offline", c: "conflict", m: "frame", x: "noui" };
const VALUES = { v: "view", nb: "nb", tag: "tag", q: "q", n: "note", s: "s", scr: "scr", t: "theme" };

function toHash() {
  const p = new URLSearchParams();
  for (const [k, f] of Object.entries(VALUES)) if (S[f] && !(f === "scr" && S.scr === "list")) p.set(k, S[f]);
  for (const [k, f] of Object.entries(FLAGS)) if (S[f]) p.set(k, 1);
  return "#" + p;
}

function fromHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (!p.has("v") && p.has("s")) applyState(+p.get("s"), false);
  else {
    for (const [k, f] of Object.entries(VALUES)) S[f] = p.get(k);
    for (const [k, f] of Object.entries(FLAGS)) S[f] = p.has(k);
    Object.assign(S, { view: S.view || "notes", q: S.q || "", s: +S.s || 0, scr: S.scr || "list" });
    if (S.edit && !EDIT) startEdit(false);
    if (S.ask && !ASK.length) ASK = demoAsk();
  }
  S.theme = p.get("t");
  S.noui = p.has("x");
}

function go(patch, mode = "push") {
  Object.assign(S, patch);
  const h = toHash();
  if (h !== location.hash) history[mode === "push" ? "pushState" : "replaceState"](null, "", h);
  render();
}
window.addEventListener("popstate", () => { fromHash(); render(); });

const KICKOFF = { view: "notes", nb: "fx-nb-projects", note: "fx-note-00" };
const STATES = [
  [1, "Browse", { view: "notes", nb: null, note: "fx-note-28" }],
  [2, "Note open", KICKOFF],
  [3, "✨ Ask", { ...KICKOFF, ask: true }],
  [4, "AI Edit diff", { ...KICKOFF, edit: true }],
  [5, "Tasks board", { view: "tasks" }],
  [6, "Offline", { ...KICKOFF, offline: true }],
  [7, "Conflict", { view: "notes", nb: "fx-nb-travel", note: "fx-note-45", conflict: true }],
  [8, "Mobile", { view: "notes", nb: null, note: "fx-note-00", frame: true }],
];

function applyState(k, push = true) {
  const st = STATES.find((x) => x[0] === k);
  if (!st) return;
  NOTES.splice(0, NOTES.length, ...JSON.parse(ORIGINAL));
  NOTES.forEach((n) => (byId[n._id] = n));
  $("#layer").innerHTML = "";
  EDIT = null;
  ASK = k === 3 ? demoAsk() : [];
  CONFLICT_DONE = false;
  Object.assign(S, { ask: false, edit: false, offline: false, conflict: false, frame: false, q: "", tag: null, scr: "list", drawer: false, aiOff: false, s: k }, st[2]);
  if (k === 4) startEdit(false);
  if (push) go({});
  else render();
}
