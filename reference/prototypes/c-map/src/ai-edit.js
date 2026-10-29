function wordDiff(a, b) {
  const A = a.split(/(\s+)/).filter(Boolean), B = b.split(/(\s+)/).filter(Boolean);
  const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  const push = (t, v) => { const last = out[out.length - 1]; if (last?.t === t) last.v += v; else out.push({ t, v }); };
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { push("=", A[i++]); j++; } else if (L[i + 1][j] >= L[i][j + 1]) push("-", A[i++]); else push("+", B[j++]);
  }
  while (i < A.length) push("-", A[i++]);
  while (j < B.length) push("+", B[j++]);
  return out;
}
function diffHTML(a, b) {
  const d = wordDiff(a, b);
  const kept = d.filter((s) => s.t === "=").map((s) => s.v).join("").trim().split(/\s+/).filter(Boolean).length;
  if (kept < b.split(/\s+/).length / 2) return `<del class="del-line">${esc(a)}</del><ins>${esc(b)}</ins>`;
  return d.map((s) => (s.t === "=" ? esc(s.v) : s.t === "-" ? `<del>${esc(s.v)}</del>` : `<ins>${esc(s.v)}</ins>`)).join("");
}

function proposeChanges(n) {
  if (n._id === "fx-note-00") return [
    { kind: "replace", block: "fx-note-00-p0", after: "Goal: a faster, calmer Harbor site with one clear call to action." },
    { kind: "replace", block: "fx-note-00-p1", after: "Owner: Ola Testesen. Deadline: end of Q4." },
    { kind: "insert", afterBlock: "fx-note-00-p1", text: "Pages and copy follow ", link: "fx-note-03", tail: "." },
  ];
  const first = sentences(n)[0] || n.title;
  const rel = tagRelated(n._id, 1)[0];
  const changes = [{ kind: "insert", afterBlock: null, text: "In short: " + first.replace(/\.$/, "").toLowerCase() + "." }];
  if (rel) changes.push({ kind: "insert", afterBlock: n.body.blocks[n.body.blocks.length - 1].id, text: "Related: ", link: rel, tail: "." });
  return changes;
}

function startAIEdit(noteId, prompt) {
  const n = byId[noteId];
  const changes = proposeChanges(n).map((c, i) => ({ ...c, i, status: "pending", before: c.block && inlineText(n.body.blocks.find((b) => b.id === c.block).content) }));
  S.ai = { noteId, prompt, changes, snapshot: JSON.stringify({ body: n.body, links: n.links }) };
}

function renderAIEdit(n, bar) {
  const ai = S.ai; const pending = ai.changes.filter((c) => c.status === "pending").length;
  const actions = pending
    ? `<button class="acc" data-act="accall">Accept all</button><button class="rej" data-act="rejall">Reject all</button>`
    : `<button class="btn sm" data-act="aiundo">Undo AI Edit <kbd>⌘Z</kbd></button><button class="btn sm primary" data-act="aidone">Done</button>`;
  const strip = `<div class="aibar"><span>✨</span><b>AI Edit</b><span>“${esc(ai.prompt)}”</span><span class="grow"></span><span class="muted">Claude Sonnet · your login · ≈ $0.004</span></div>
    <div class="aibar" style="background:var(--c-surface)"><b>${ai.changes.length} changes</b><span class="muted">${pending ? `${pending} to review` : "all reviewed"}</span><span class="grow"></span>${actions}</div>`;
  const box = (c, inner) => `<div class="chg ${c.status === "pending" ? "pending" : "done"}"><div class="chg-h"><span class="num">${c.i + 1}</span>${c.kind === "replace" ? "Rewrite" : c.link ? "Add a link" : "Add a line"}<span class="acts">${c.status === "pending"
    ? `<button class="acc" data-acc="${c.i}">✓ Accept</button><button class="rej" data-rej="${c.i}">✕ Reject</button>`
    : `<span class="state-tag ${c.status === "accepted" ? "a" : "r"}">${c.status === "accepted" ? "Accepted" : "Rejected"}</span>`}</span></div>${inner}</div>`;
  const insText = (c) => esc(c.text) + (c.link ? `<a class="wl prop" data-id="${c.link}">${esc(byId[c.link].title)}</a>` : "") + esc(c.tail || "");
  const inserts = (after) => ai.changes.filter((c) => c.kind === "insert" && c.afterBlock === after)
    .map((c) => box(c, `<p>${c.status === "pending" ? `<ins>${insText(c)}</ins>` : c.status === "rejected" ? `<del>${insText(c)}</del>` : insText(c)}</p>`)).join("");
  let body = inserts(null);
  for (const b of n.body.blocks) {
    if (ai.changes.some((c) => c.createdId === b.id)) continue;
    const c = ai.changes.find((c) => c.block === b.id);
    body += c ? box(c, `<p>${c.status === "pending" ? diffHTML(c.before, c.after) : esc(c.status === "accepted" ? c.after : c.before)}</p>`) : blockHTML(b);
    body += inserts(b.id);
  }
  $("#editor").innerHTML = bar + strip + `<div class="ed-scroll"><article class="doc"><h1 class="doc-title">${esc(n.title)}</h1>${metaHTML(n)}<div class="doc-body">${body}</div></article></div>`;
}

function resolveChange(i, accept) {
  const c = S.ai.changes[i]; const n = byId[S.ai.noteId];
  c.status = accept ? "accepted" : "rejected";
  if (accept && c.kind === "replace") n.body.blocks.find((b) => b.id === c.block).content = [{ type: "text", value: c.after }];
  if (accept && c.kind === "insert") {
    const content = [{ type: "text", value: c.text }];
    if (c.link) { content.push({ type: "wikilink", target: c.link, docId: c.link, children: [{ type: "text", value: byId[c.link].title }] }, { type: "text", value: c.tail }); n.links.push({ _ref: c.link, _key: c.link }); }
    c.createdId = `${n._id}-ai${i}`;
    const at = c.afterBlock ? n.body.blocks.findIndex((b) => b.id === c.afterBlock) + 1 : 0;
    n.body.blocks.splice(at, 0, { id: c.createdId, type: "paragraph", content });
  }
  if (accept) touch(n);
}

function undoAI() {
  const n = byId[S.ai.noteId]; Object.assign(n, JSON.parse(S.ai.snapshot)); S.ai = null;
  refreshAll(); toast("AI Edit undone. The note is as it was.");
}
