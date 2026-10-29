const CONFLICT = {
  note: "fx-note-45",
  a: { dev: "This Mac", icon: "laptop", ago: 9, text: "Charger, passport, wool sweater, rain jacket.",
    tasks: [["First step", true], ["Second step", false], ["Follow up", false]] },
  b: { dev: "Phone", icon: "phone", ago: 0, note: "while offline", text: "Charger, passport, wool sweater.",
    tasks: [["First step", true], ["Second step", true], ["Follow up", false], ["Buy a travel adapter", false]] },
};
let CONFLICT_DONE = false;

function editedAgo(min) {
  const d = parseT(byId[CONFLICT.note].updated);
  d.setMinutes(d.getMinutes() - min);
  return `${WD[d.getDay()]} ${hhmm(d)}`;
}

function versionHTML(side) {
  const v = CONFLICT[side], other = CONFLICT[side === "a" ? "b" : "a"];
  const otherTasks = new Set(other.tasks.map(String));
  const line = (inner, differs) => `<div class="cf-line${differs ? " diff" : ""}">${inner}${differs ? `<span class="tagd">only here</span>` : ""}</div>`;
  const task = ([t, done]) => line(`<span class="cb ${done ? "on" : ""}">${ic("check")}</span><span class="${done ? "struck" : ""}">${esc(t)}</span>`, !otherTasks.has(String([t, done])));
  return `<div class="cf-col"><div class="h">${ic(v.icon)}${v.dev}<span>· ${editedAgo(v.ago)}${v.note ? " · " + v.note : ""}</span></div>
    <div class="b">${line(`<span>${esc(v.text)}</span>`, v.text !== other.text)}${v.tasks.map(task).join("")}</div>
    <div class="f"><button class="btn sm" data-keep="${side}">${ic("check")}Keep ${v.dev} version</button></div></div>`;
}

function conflictHTML(n) {
  return `<div class="doc" style="max-width:860px"><h1 class="title">${esc(n.title)}</h1>
    <div class="cf-head">${ic("warn")}<div><b>Edited on two devices while one was offline</b><span>Both versions are kept until you choose. Differences are marked.</span></div></div>
    <div class="cf-cols">${versionHTML("a")}${versionHTML("b")}</div>
    <div class="cf-both"><button class="btn sm" data-keep="both">Keep both as separate notes</button></div></div>`;
}

function versionBody(id, v) {
  return { blocks: [
    { id: id + "-p0", type: "paragraph", content: [{ type: "text", value: v.text }] },
    { id: id + "-t", type: "list", ordered: false, task: true, items: v.tasks.map(([t, checked]) => ({ content: [{ type: "text", value: t }], checked })) },
  ] };
}

function keepVersion(side) {
  const n = byId[CONFLICT.note];
  n.body = versionBody(n._id, CONFLICT[side === "both" ? "a" : side]);
  n.updated = META.now;
  if (side === "both") {
    const copy = { ...n, _id: n._id + "-phone", title: n.title + " (Phone)", body: versionBody(n._id + "-phone", CONFLICT.b) };
    NOTES.push(copy);
    byId[copy._id] = copy;
    toast("Kept both. The phone version is a new note.");
  } else toast(`Kept the ${CONFLICT[side].dev} version. The other stays in note history.`, "Undo", () => applyState(7));
  CONFLICT_DONE = true;
  go({ conflict: false });
}
