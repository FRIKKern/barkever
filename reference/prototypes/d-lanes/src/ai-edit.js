const AI_SCRIPT = {
  "fx-note-00": { prompt: "Tighten it and name the open tasks", changes: [
    { target: "fx-note-00-p0", neu: "Goals: faster pages, calmer navigation and one clear call to action." },
    { target: "fx-note-00-p1", neu: "Owner: Ola Testesen. Deadline: end of Q4." },
    { target: "fx-note-00-t:1", neu: "Agree the sitemap with the client", cite: "fx-note-01", why: "Open question: does Work need filters?" },
    { target: "fx-note-00-t:2", neu: "Follow up on a stronger services page", cite: "fx-note-13", why: "Client wants a stronger services page." },
  ] },
};
function getText(target) {
  if (target.includes(":")) { const t = taskByKey(target); return t.text; }
  const n = D.notes.find((n) => n.blocks.some((b) => b.id === target)); return txt(n.blocks.find((b) => b.id === target).content);
}
function setText(target, s) {
  if (target.includes(":")) { taskByKey(target).it.content = [{ type: "text", value: s }]; return; }
  const n = D.notes.find((n) => n.blocks.some((b) => b.id === target)); n.blocks.find((b) => b.id === target).content = [{ type: "text", value: s }];
}
function wdiff(a, b) {
  const A = a.split(/(\s+)/).filter(Boolean), B = b.split(/(\s+)/).filter(Boolean);
  const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  const push = (t, s) => { const last = out.at(-1); if (last && last.t === t) last.s += s; else out.push({ t, s }); };
  while (i < A.length && j < B.length) { if (A[i] === B[j]) { push("=", A[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) push("-", A[i++]); else push("+", B[j++]); }
  while (i < A.length) push("-", A[i++]); while (j < B.length) push("+", B[j++]);
  return out;
}
function hunks(a, b) {
  const out = [];
  for (const p of wdiff(a, b)) {
    const last = out.at(-1);
    if (p.t === "=" && !(last?.t === "x" && !last.gap && /^\s+$/.test(p.s))) {
      if (last?.gap) { out.push({ t: "=", s: last.gap }); last.gap = ""; }
      out.push({ t: "=", s: p.s });
      continue;
    }
    if (last?.t !== "x") out.push({ t: "x", del: "", ins: "", gap: "" });
    const h = out.at(-1);
    if (p.t === "=") { h.gap = p.s; continue; }
    if (h.gap) { h.del += h.del && h.gap; h.ins += h.ins && h.gap; h.gap = ""; }
    h[p.t === "-" ? "del" : "ins"] += p.s;
  }
  return out.flatMap((h) => (h.gap ? [h, { t: "=", s: h.gap }] : [h]));
}
const diffHtml = (a, b) => hunks(a, b).map((h) => h.t === "=" ? esc(h.s) : (h.del ? `<del>${esc(h.del)}</del>` : "") + (h.ins ? `<ins>${esc(h.ins)}</ins>` : "")).join("");
function changeCard(c, item) {
  const body = c.status === "accepted" ? `<ins>${esc(c.neu)}</ins>` : c.status === "rejected" ? esc(c.old) : diffHtml(c.old, c.neu);
  const isTask = c.target.includes(":");
  const why = c.cite ? `<span>· from <a data-open="${c.cite}">${esc(byId[c.cite].title)}</a></span>` : "";
  const acts = c.status === "pending"
    ? `<button class="btn sm line" data-act="ai-no" data-id="${c.target}"><span class="no">✕</span> Reject</button><button class="btn sm line" data-act="ai-ok" data-id="${c.target}"><span class="ok">✓</span> Accept</button>`
    : `<span class="state">${c.status === "accepted" ? "✓ Accepted" : "Rejected · original kept"}</span><button class="btn sm" data-act="ai-reset" data-id="${c.target}">Change</button>`;
  return `<div class="chg ${c.status}" id="blk-${c.target}"><div class="chg-body ${isTask ? "task" : ""}">${isTask ? `<span class="cb ${item && item.checked ? "on" : ""}"></span>` : ""}<span>${body}</span></div>
    <div class="chg-f"><span>${isTask ? "Checklist line" : "Paragraph"}</span>${why}<span class="grow"></span>${acts}</div></div>`;
}
function startAiEdit(id) {
  const sc = AI_SCRIPT[id];
  if (!sc) { toast("AI Edit is scripted for “Harbor redesign: kickoff” in this prototype", { open: "fx-note-00" }); return; }
  S.ai = { noteId: id, prompt: sc.prompt, changes: sc.changes.map((c) => ({ ...c, old: getText(c.target), status: "pending" })) };
}
function setChange(target, status) {
  S.ai.changes.find((c) => c.target === target).status = status;
}
function undoAiEdit() {
  if (undoSnap) byId[undoSnap.noteId].blocks = undoSnap.blocks;
  undoSnap = null;
  S.toast = null;
}
function finishAiEdit() {
  const ai = S.ai; const acc = ai.changes.filter((c) => c.status === "accepted");
  if (acc.length) { undoSnap = { noteId: ai.noteId, blocks: structuredClone(byId[ai.noteId].blocks) }; acc.forEach((c) => setText(c.target, c.neu)); byId[ai.noteId].edited = 0; }
  S.ai = null;
  if (acc.length) toast(`${acc.length} AI change${acc.length > 1 ? "s" : ""} applied`, { undo: true });
}
