let EDIT = null;

const EDIT_DEMO = {
  note: "fx-note-00",
  instr: "Tighten the wording and make the next steps concrete",
  tokens: 1180,
  changes: [
    { b: "fx-note-00-p0", to: "Harbor redesign goals: faster pages, calmer navigation and one clear call to action." },
    { b: "fx-note-00-p1", to: "Owner: Ola Testesen. Due at the end of the quarter." },
    { b: "fx-note-00-t", i: 1, to: "Sign off the wireframes" },
    { b: "fx-note-00-t", i: 2, to: "Follow up with the client on the services page" },
  ],
};

const tok = (s) => s.match(/\s+|[^\s.,:;!?]+|[.,:;!?]/g) || [];

function wdiff(a, b) {
  const A = tok(a), B = tok(b);
  const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  const push = (t, s) => (out.at(-1)?.t === t ? (out.at(-1).s += s) : out.push({ t, s }));
  let i = 0, j = 0;
  while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) { push("=", A[i++]); j++; }
    else if (j >= B.length || (i < A.length && L[i + 1][j] >= L[i][j + 1])) push("-", A[i++]);
    else push("+", B[j++]);
  }
  const tag = { "=": (s) => s, "-": (s) => `<del>${s}</del>`, "+": (s) => `<ins>${s}</ins>` };
  return out.map((p) => tag[p.t](esc(p.s))).join("");
}

const blockOf = (n, ch) => n.body.blocks.find((x) => x.id === ch.b);
const getText = (n, ch) => inlineText(ch.i == null ? blockOf(n, ch).content : items(blockOf(n, ch))[ch.i].content);

function setText(n, ch, v) {
  const b = blockOf(n, ch), content = [{ type: "text", value: v }];
  if (ch.i == null) b.content = content;
  else b.items[ch.i].content = content;
}

function startEdit(doRender = true) {
  const n = byId[S.note];
  if (n?._id !== EDIT_DEMO.note) {
    toast("AI Edit is scripted for one note in this prototype.", "Open it", () => { applyState(4); });
    return;
  }
  EDIT = { ...EDIT_DEMO, snapshot: JSON.stringify(n.body), changes: EDIT_DEMO.changes.map((c) => ({ ...c, from: getText(n, c), st: "pending" })) };
  S.edit = true;
  S.ask = false;
  if (doRender) go({});
}

function editBarHTML() {
  const count = (st) => EDIT.changes.filter((c) => c.st === st).length;
  const pend = count("pending");
  const r1 = pend
    ? `${ic("pen")}<span class="instr">${esc(EDIT.instr)}</span>
       <button class="btn sm" data-act="rejectall">Reject all</button>
       <button class="btn sm primary" data-act="acceptall">${ic("check")}Accept all ${pend}</button>`
    : `${ic("check")}<span style="flex:1"><b>${count("yes")} accepted</b>, ${count("no")} rejected. Note updated.</span>
       <button class="btn sm" data-act="undoedit">${ic("undo")}Undo AI Edit</button>
       <button class="btn sm primary" data-act="doneedit">Done</button>`;
  return `<div class="aibar"><div class="r1">${r1}</div>
    <div class="r2"><span>AI Edit · Claude · your login · ${EDIT.tokens.toLocaleString("en")} tokens</span><span>·</span>
    <span>${EDIT.changes.length} changes, ${pend} to review</span><span class="legend" style="margin-left:auto"><del>removed</del><ins>added</ins></span></div></div>`;
}

function hunkHTML(k, current) {
  const c = EDIT.changes[k];
  if (c.st !== "pending") return `${current}<span class="res">${c.st === "yes" ? "accepted" : "rejected"}</span>`;
  return `<div class="hunk"><span class="n">${k + 1}</span><div class="hx">${wdiff(c.from, c.to)}</div>
    <span class="hc"><button class="yes" data-hunk="${k}|yes">${ic("check")}Accept</button><button class="no" data-hunk="${k}|no">${ic("x")}Reject</button></span></div>`;
}

function editDocHTML(n) {
  const find = (bid, i = null) => EDIT.changes.findIndex((c) => c.b === bid && (c.i ?? null) === i);
  const block = (b) => {
    if (b.type === "paragraph" && find(b.id) >= 0) return `<div class="para" data-b="${b.id}">${hunkHTML(find(b.id), inlineHTML(b.content))}</div>`;
    if (!(b.type === "list" && b.task)) return blockHTML(b, n);
    return `<ul class="cl">${items(b).map((it, i) => {
      const k = find(b.id, i);
      const box = `<button class="cb ${it.checked ? "on" : ""}" data-check="${n._id}|${b.id}|${i}">${ic("check")}</button>`;
      const text = k < 0 ? `<span>${inlineHTML(it.content)}</span>` : hunkHTML(k, `<span>${inlineHTML(it.content)}</span>`);
      return `<li class="${it.checked ? "done" : ""}">${box}${text}</li>`;
    }).join("")}</ul>`;
  };
  return `<div class="doc"><h1 class="title">${esc(n.title)}</h1>
    <div class="doc-meta"><span>Reviewing ${EDIT.changes.length} suggested changes. Nothing is saved until you accept.</span></div>
    <div class="body">${n.body.blocks.map(block).join("")}</div></div>`;
}

function resolveHunk(k, v) {
  const n = byId[EDIT.note], c = EDIT.changes[k];
  if (c.st !== "pending") return;
  c.st = v;
  if (v === "yes") setText(n, c, c.to);
  n.updated = META.now;
  render();
}
