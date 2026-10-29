const PRESETS = {
  1: { label: "Browse", hash: "s=1&nb=all&n=fx-note-00" },
  2: { label: "Note open", hash: "s=2&nb=fx-nb-projects&n=fx-note-00&focus=1" },
  3: { label: "✨ Ask", hash: "s=3&nb=all&n=fx-note-02&ask=1" },
  4: { label: "AI Edit", hash: "s=4&nb=fx-nb-projects&n=fx-note-00&edit=1" },
  5: { label: "Tasks", hash: "s=5&v=tasks" },
  6: { label: "Offline", hash: "s=6&nb=fx-nb-home&n=fx-note-29&off=1" },
  7: { label: "Conflict", hash: "s=7&nb=fx-nb-home&n=fx-note-29&off=1&conf=1" },
  8: { label: "Mobile", hash: "s=8&nb=all&m=1" },
};
let S = {};
let ui = { aiMenu: false, aiOn: true, hunks: null, editUndo: null, conflictResolved: false, askThread: null, flash: null, toast: null };
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return { s: +p.get("s") || 0, v: p.get("v") || "notes", nb: p.get("nb") || "all", n: p.get("n") || null, q: p.get("q") || "",
    ask: p.get("ask") === "1", edit: p.get("edit") === "1", off: p.get("off") === "1", conf: p.get("conf") === "1", m: p.get("m") === "1",
    focus: p.get("focus") === "1", line: p.get("line") || null, mn: p.get("mn") === "1" };
}
function writeHash(patch, replace = false) {
  const next = { ...S, ...patch }; const p = new URLSearchParams();
  if (next.s) p.set("s", next.s);
  if (next.v !== "notes") p.set("v", next.v);
  if (next.v === "notes" || next.m) { p.set("nb", next.nb); if (next.n) p.set("n", next.n); }
  if (next.q) p.set("q", next.q);
  for (const k of ["ask", "edit", "off", "conf", "m", "mn"]) if (next[k]) p.set(k, "1");
  if (next.line) p.set("line", next.line);
  const h = "#" + p.toString();
  if (replace) { history.replaceState(null, "", h); S = readHash(); render(); } else location.hash = h;
}
function setPreset(k) {
  restore();
  ui = { ...ui, focused: false, flashed: null, aiMenu: false, hunks: null, editUndo: null, conflictResolved: false, askThread: k === 3 ? seededThread() : ui.askThread, flash: null, toast: null };
  if (location.hash.slice(1) === PRESETS[k].hash) { S = readHash(); render(); } else location.hash = PRESETS[k].hash;
}
