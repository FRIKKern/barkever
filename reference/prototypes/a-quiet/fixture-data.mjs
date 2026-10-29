import { readFileSync } from "node:fs";

const LEAD = ["00", "28", "12", "45", "23", "03", "16", "29", "02", "01", "13", "11", "30", "08", "24", "10", "19", "43", "05", "04"];
const NOW = Date.UTC(2026, 9, 29, 12, 0);
const iso = (ms) => new Date(ms).toISOString().slice(0, 16);

function editTimes(notes) {
  const rest = notes.map((n) => n._id).filter((id) => !LEAD.includes(id.slice(-2))).reverse();
  const order = [...LEAD.map((n) => `fx-note-${n}`), ...rest];
  const dates = {};
  let t = Date.UTC(2026, 9, 29, 10, 42);
  order.forEach((id, k) => {
    if (k === 1) t -= 157 * 60e3;
    if (k > 1) t -= (5 + ((k * 7919) % 31)) * 3600e3 + ((k * 37) % 60) * 60e3;
    dates[id] = iso(t);
  });
  return dates;
}

export function fixtureData(url) {
  const rows = readFileSync(url, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const notes = rows.filter((r) => r._type === "note");
  const dates = editTimes(notes);
  return {
    meta: { now: iso(NOW), user: "Ola Testesen", shortcuts: ["fx-note-00", "fx-note-28", "fx-note-18", "fx-note-42", "fx-note-49"] },
    notebooks: rows.filter((r) => r._type === "notebook").map(({ _id, name, parent }) => ({ _id, name, parent: parent?._ref ?? null })),
    notes: notes.map((n) => ({ ...n, updated: dates[n._id] })),
  };
}
