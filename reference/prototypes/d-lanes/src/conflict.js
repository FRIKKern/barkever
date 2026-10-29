const CONFLICT = {
  id: "fx-note-30", mac: "This Mac", macAt: "edited offline 12:41", other: "iPhone", otherAt: "edited 13:05",
  otherBlocks: { "fx-note-30-p0": "Plant tulips and crocuses in late October.", "fx-note-30-p1": "Cover the roses before the first frost, around 10 November." },
  otherChecks: { 1: true },
};
function renderConflict(back) {
  const n = byId[CONFLICT.id];
  const col = (side) => {
    const isMac = side === "mac";
    const body = n.blocks.map((b) => {
      if (b.type === "paragraph") {
        const a = txt(b.content), o = CONFLICT.otherBlocks[b.id] ?? a;
        return `<p>${hunks(a, o).map((h) => h.t === "=" ? esc(h.s) : h[isMac ? "del" : "ins"] ? `<span class="diffmark">${esc(h[isMac ? "del" : "ins"])}</span>` : "").join("")}</p>`;
      }
      if (b.task) return `<div class="checklist">${b.items.map((it, i) => { const ch = isMac ? it.checked : CONFLICT.otherChecks[i] ?? it.checked; const diff = ch !== (CONFLICT.otherChecks[i] ?? it.checked) || ch !== it.checked; return `<div class="ck ${ch ? "done" : ""}"><span class="cb ${ch ? "on" : ""}"></span><span class="ck-t ${diff ? "diffmark" : ""}">${esc(txt(it.content))}</span></div>`; }).join("")}</div>`;
      return "";
    }).join("");
    return `<div class="cf-col"><div class="cf-ch"><b>${isMac ? CONFLICT.mac : CONFLICT.other}</b><span>${isMac ? CONFLICT.macAt : CONFLICT.otherAt}</span><span class="grow"></span><button class="btn sm line" data-act="cf-keep" data-side="${side}">Keep only this</button></div><h3>${esc(n.title)}</h3>${body}</div>`;
  };
  return `<div class="ed-bar">${back}<span>${nbPath(n.nb).map(esc).join(" › ")}</span><span class="grow"></span><span>2 versions</span></div>
    <div class="cf"><div class="cf-h"><b>Edited in two places while offline.</b><span>Both versions are kept. Nothing is lost until you choose.</span></div>
    <div class="cf-cols">${col("mac")}${col("other")}</div>
    <div class="cf-f"><span class="diffmark" style="background:var(--mark-bg);padding:0 4px;border-radius:2px">marked</span> = differs<span class="grow"></span><button class="btn primary" data-act="cf-keep" data-side="both">Keep both as two notes</button></div></div>`;
}
