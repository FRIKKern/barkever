function wordDiff(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/), m = A.length, n = B.length;
  const T = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) T[i][j] = A[i] === B[j] ? T[i + 1][j + 1] + 1 : Math.max(T[i + 1][j], T[i][j + 1]);
  const out = []; let i = 0, j = 0;
  const push = (t, s) => { const l = out[out.length - 1]; if (l && l.t === t) l.s += s; else out.push({ t, s }); };
  while (i < m && j < n) { if (A[i] === B[j]) { push("eq", A[i]); i++; j++; } else if (T[i + 1][j] >= T[i][j + 1]) push("del", A[i++]); else push("ins", B[j++]); }
  while (i < m) push("del", A[i++]); while (j < n) push("ins", B[j++]);
  return out.map((p) => p.t === "eq" ? esc(p.s) : p.t === "del" ? `<del>${esc(p.s)}</del>` : `<ins>${esc(p.s)}</ins>`).join("");
}
function makeHunks() {
  return [
    { block: "fx-note-00-p0", from: "Goals for the Harbor site redesign: faster pages, calmer navigation, one clear call to action.", to: "Three goals for the Harbor redesign: faster pages, calmer navigation and one clear call to action.", state: null },
    { block: "fx-note-00-p1", from: "Owner: Ola Testesen. Deadline end of quarter.", to: "Owner: Ola Testesen. Due at the end of the quarter.", state: null },
    { block: "fx-note-00-p1", insertAfter: true, from: "", to: "Open question: does Work need filters?", src: "fx-note-01", state: null },
  ];
}
function editBarHTML() {
  const h = ui.hunks, decided = h.filter((x) => x.state).length, acc = h.filter((x) => x.state === "acc").length;
  const done = decided === h.length;
  return `<div class="edit-bar" role="region" aria-label="AI Edit">
    <span class="spark">${ico("spark")}</span><span class="edit-prompt">“Tighten the summary”</span>
    <span>· Claude</span><span class="grow"></span>
    ${done ? `<span>${acc} of ${h.length} applied</span><button class="btn small" data-act="edit-undo">${ico("undo", "ico-s")}Undo</button><button class="btn small primary" data-act="edit-close">Done</button>`
      : `<span class="num">${h.length - decided} to review</span><button class="btn small" data-act="edit-all-no">Reject all</button><button class="btn small primary" data-act="edit-all-ok">Accept all</button>`}
  </div>`;
}
function editBodyHTML(n) {
  if (ui.editUndo) return n.blocks.map((b) => blockHTML(n, b, false)).join("");
  const out = [];
  for (const b of n.blocks) {
    const hs = ui.hunks.map((h, i) => ({ ...h, i })).filter((h) => h.block === b.id);
    const rep = hs.find((h) => !h.insertAfter);
    if (rep) out.push(hunkHTML(rep)); else out.push(blockHTML(n, b, false));
    hs.filter((h) => h.insertAfter).forEach((h) => out.push(hunkHTML(h)));
  }
  return out.join("");
}
function hunkHTML(h) {
  if (h.state === "acc") return `<div class="hunk decided"><p>${esc(h.to)}</p></div>`;
  if (h.state === "rej") return h.insertAfter ? "" : `<div class="hunk decided"><p>${esc(h.from)}</p></div>`;
  const src = h.src ? byId[h.src] : null;
  return `<div class="hunk"><p>${h.insertAfter ? `<ins>${esc(h.to)}</ins>` : wordDiff(h.from, h.to)}</p>
    <div class="hunk-actions"><button class="btn small ok" data-hunk="${h.i}|acc">${ico("check", "ico-s")}Accept</button><button class="btn small no" data-hunk="${h.i}|rej">${ico("x", "ico-s")}Reject</button>
    ${src ? `<span class="src">from <a class="wikilink" data-go="${src.id}">${esc(src.title)}</a></span>` : ""}</div></div>`;
}
function applyHunks() {
  const n = byId["fx-note-00"]; ui.editUndo = JSON.stringify(n.blocks);
  for (const h of ui.hunks) {
    if (h.state !== "acc") continue;
    const i = n.blocks.findIndex((b) => b.id === h.block);
    if (h.insertAfter) n.blocks.splice(i + 1, 0, { id: "fx-note-00-ai" + Math.random().toString(36).slice(2, 6), type: "paragraph", content: [{ type: "text", value: h.to }] });
    else n.blocks[i] = { ...n.blocks[i], content: [{ type: "text", value: h.to }] };
  }
  n.updated = NOW; derive(n);
}
