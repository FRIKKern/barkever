const hash = (s) => {
  let h = 2166136261;
  for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
};

const OPEN_DUE = [-1, 0, 0, 0, 1, 1, 2, 3, 4, 5, 6, 2, 3, 8, 10, 13, 17, 24, null];
const NOTE_DAY = { "fx-note-28": 0, "fx-note-13": 0, "fx-note-43": 1, "fx-note-05": 2, "fx-note-36": 3, "fx-note-17": 6, "fx-note-09": 9, "fx-note-46": 15 };
const PROJECTS = [
  { id: "harbor", name: "Harbor redesign", key: "harbor", hue: 1 },
  { id: "lighthouse", name: "Lighthouse app", key: "lighthouse", hue: 2 },
  { id: "quarry", name: "Quarry rebrand", key: "quarry", hue: 3 },
  { id: "team", name: "Team", notebooks: ["fx-nb-work", "fx-nb-meetings"], hue: 4 },
  { id: "household", name: "Household", notebooks: ["fx-nb-home", "fx-nb-inbox"], hue: 5 },
  { id: "travel", name: "Travel", notebooks: ["fx-nb-travel"], hue: 6 },
];

const inline = (c) => c.value ?? c.children.map((x) => x.value).join("");
const words = (n) => [n.title, ...n.body.blocks.map((b) => b.text ?? (b.content ?? []).map(inline).join(""))].join(" ").toLowerCase();
const hasTasks = (n) => n.body.blocks.some((b) => b.task);

function projectOf(n) {
  const tagged = PROJECTS.find((p) => n.tags.includes(p.key));
  if (tagged) return tagged.id;
  const named = PROJECTS.filter((p) => p.key && words(n).includes(p.key));
  if (named.length === 1) return named[0].id;
  const home = PROJECTS.find((p) => p.notebooks?.includes(n.notebook._ref));
  if (!home || (n.notebook._ref === "fx-nb-inbox" && !hasTasks(n))) return null;
  return home.id;
}

const planItems = (b) => b.items.map((it, i) => {
  const h = hash(`${b.id}:${i}`);
  return it.checked ? { ...it, done: -1 - (h % 6) } : { ...it, due: OPEN_DUE[h % OPEN_DUE.length] };
});

export function plan(docs) {
  const notebooks = docs.filter((d) => d._type === "notebook").map((d) => ({ id: d._id, name: d.name, parent: d.parent?._ref ?? null }));
  const notes = docs.filter((d) => d._type === "note").map((n) => {
    const h = hash(n._id);
    return {
      id: n._id, title: n.title, nb: n.notebook._ref, tags: n.tags,
      blocks: n.body.blocks.map((b) => (b.task ? { ...b, items: planItems(b) } : b)),
      links: n.links.map((l) => l._ref), project: projectOf(n),
      day: NOTE_DAY[n._id] ?? null, edited: NOTE_DAY[n._id] === 0 ? -(h % 400) : -((h % 600) + 1440 * (h % 23)),
    };
  });
  return { today: "2026-10-29", now: "14:20", notebooks, projects: PROJECTS.map(({ id, name, hue }) => ({ id, name, hue })), notes };
}
