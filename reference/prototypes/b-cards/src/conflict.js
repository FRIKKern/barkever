function renderConflict(main, n) {
  const base = JSON.parse(ORIGINAL["fx-note-29"]).find((b) => b.task).items.map((i) => [inlineText(i.content), i.checked]);
  const mac = [["Bread", 1], ["Leeks", 1], ["Carrots", 0], ["Cream", 0], ["Fresh fish", 0], ["Coffee", 1], ["Butter", 0]];
  const phone = [["Bread", 1], ["Leeks", 0], ["Carrots", 1], ["Cream", 0], ["Fresh cod", 0], ["Coffee", 1], ["Lemons", 0]];
  const mark = (v) => v.map(([t, c], i) => {
    const b = base[i]; const added = !b; const changed = b && (b[0] !== t || !!b[1] !== !!c);
    const tag = added ? "added" : changed ? (b[0] !== t ? "renamed" : c ? "checked" : "unchecked") : "";
    return `<div class="vi ${added ? "added" : changed ? "changed" : ""}"><span class="cb ${c ? "on" : ""}">${c ? ico("check") : ""}</span><span>${esc(t)}</span>${tag ? `<span class="tag">${tag}</span>` : ""}</div>`;
  }).join("");
  const fake = (items) => ({ blocks: [{ type: "paragraph", content: [{ type: "text", value: "x" }] }, { type: "list", task: true, items: items.map(([t, c]) => ({ checked: !!c, content: [] })) }] });
  const ver = (who, whenTxt, items, id) => `<section class="ver"><div class="ver-h">${shapeSVG(fake(items), 1.1)}<span><div class="who">${who}</div><div class="when">${whenTxt}</div></span></div>
    <div class="ver-b"><p>The usual, plus things for Sunday dinner.</p>${mark(items)}</div>
    <div class="ver-f"><button class="btn" data-act="resolve" data-keep="${id}">Keep this version</button></div></section>`;
  main.innerHTML = topBar(n) + `<div class="doc-wrap"><div class="doc-grid narrow" style="grid-template-columns:minmax(0,860px)"><article class="doc">
    <div class="conflict-head">${ico("cloudOff")}<span class="grow"><b>Edited in two places while offline.</b> Both versions are kept until you choose.</span><button class="btn primary" data-act="resolve" data-keep="both">Merge both</button></div>
    <h1 class="doc-title">${esc(n.title)}</h1><div class="doc-meta">Changes since the last sync, side by side</div>
    <div class="versions">${ver("This Mac", "Today 14:02 · offline edit", mac, "mac")}${ver("iPhone", "Today 14:05 · offline edit", phone, "phone")}</div>
    <div class="legend"><span><i style="background:var(--warn-soft)"></i>changed</span><span><i style="background:var(--ins-bg)"></i>added</span><span>Nothing is lost: the version you don’t keep stays in history.</span></div>
  </article></div></div>`;
}
function resolveConflict(keep) {
  const n = byId["fx-note-29"]; const list = n.blocks.find((b) => b.task);
  const merged = { mac: [["Bread", 1], ["Leeks", 1], ["Carrots", 0], ["Cream", 0], ["Fresh fish", 0], ["Coffee", 1], ["Butter", 0]],
    phone: [["Bread", 1], ["Leeks", 0], ["Carrots", 1], ["Cream", 0], ["Fresh cod", 0], ["Coffee", 1], ["Lemons", 0]],
    both: [["Bread", 1], ["Leeks", 1], ["Carrots", 1], ["Cream", 0], ["Fresh cod", 0], ["Coffee", 1], ["Butter", 0], ["Lemons", 0]] }[keep];
  list.items = merged.map(([t, c]) => ({ content: [{ type: "text", value: t }], checked: !!c }));
  derive(n); ui.conflictResolved = true;
  toast(keep === "both" ? "Merged both versions." : `Kept the ${keep === "mac" ? "Mac" : "iPhone"} version. The other is in history.`);
  writeHash({ conf: false });
}
