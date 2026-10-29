function makeConflict() {
  const n = byId["fx-note-30"];
  const phone = JSON.parse(JSON.stringify(n.body));
  const block = (id) => phone.blocks.find((b) => b.id === id);
  block("fx-note-30-p0").content = [{ type: "text", value: "Plant tulips and crocus bulbs in late October." }];
  block("fx-note-30-p1").content = [{ type: "text", value: "Cover the roses before the first frost." }];
  block("fx-note-30-t").items[1].checked = true;
  return { noteId: n._id, mac: { label: "This Mac", keep: "this Mac’s", when: "Edited today 14:02, offline" }, phone: { label: "iPhone", keep: "the iPhone’s", when: "Edited today 14:05, offline", body: phone } };
}

function versionHTML(blocks, other) {
  return blocks.map((b, i) => {
    const o = other[i];
    if (b.type === "paragraph") return `<p>` + wordDiff(inlineText(o.content), inlineText(b.content)).filter((s) => s.t !== "-").map((s) => (s.t === "+" ? `<span class="only">${esc(s.v)}</span>` : esc(s.v))).join("") + `</p>`;
    if (b.task) return `<ul>` + b.items.map((it, j) => `<li class="tk${it.checked ? " done" : ""}${it.checked !== o.items[j].checked ? " diff" : ""}"><span class="cb"></span><span class="tt">${esc(inlineText(it.content))}</span></li>`).join("") + `</ul>`;
    return blockHTML(b);
  }).join("");
}

function renderConflict(n) {
  const cf = S.conflict; const mac = n.body.blocks, phone = cf.phone.body.blocks;
  const col = (v, blocks, other, key) => `<div class="cf-col"><div class="cf-head"><b>${v.label}</b><span>${v.when}</span></div><div class="cf-body"><h1>${esc(n.title)}</h1>${versionHTML(blocks, other)}</div><div class="cf-foot"><button class="btn" data-keep="${key}">Keep ${v.keep} version</button></div></div>`;
  $("#editor").innerHTML = `<div class="bar ed-bar">${crumbHTML(n)}<div class="ed-actions"><span class="saved">2 versions</span></div></div>
    <div class="cf-note">This note changed on two devices while offline. Nothing is lost: both versions stay until you choose. Differences are highlighted.</div>
    <div class="ed-scroll"><div class="cf">${col(cf.mac, mac, phone, "mac")}${col(cf.phone, phone, mac, "phone")}<div class="cf-both"><button class="btn primary" data-keep="both">Keep both</button><span>Saves the iPhone version as a second note, linked to this one.</span></div></div></div>`;
}

function resolveConflict(which) {
  const cf = S.conflict, n = byId[cf.noteId], phone = cf.phone.body;
  if (which === "phone") n.body = phone;
  if (which === "both") {
    const id = "fx-note-30b";
    const blocks = phone.blocks.map((b) => ({ ...b, id: b.id.replace(n._id, id) }));
    blocks.push({ id: id + "-l", type: "paragraph", content: [{ type: "text", value: "Other version: " }, { type: "wikilink", target: n._id, docId: n._id, children: [{ type: "text", value: n.title }] }, { type: "text", value: "." }] });
    const copy = { _type: "note", _id: id, title: n.title + " (iPhone)", notebook: n.notebook, tags: n.tags, body: { blocks }, links: [{ _ref: n._id, _key: n._id }] };
    NOTES.push(copy); byId[id] = copy; touch(copy); computeMap();
  }
  touch(n); S.conflict = null;
  render(true);
  toast(which === "both" ? "Kept both. The iPhone version is a linked note." : `Kept ${cf[which].keep} version.`);
}
