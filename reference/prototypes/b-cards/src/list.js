function inScope(n) {
  if (S.nb === "all") return true;
  if (S.nb.startsWith("tag:")) return n.tags.includes(S.nb.slice(4));
  return n.nb === S.nb || nbById[n.nb]?.parent === S.nb;
}
function visibleNotes() {
  const q = S.q.trim().toLowerCase();
  const list = q ? notes.filter((n) => q.split(/\s+/).every((w) => n.text.includes(w))) : notes.filter(inScope);
  return list.sort((a, b) => b.updated - a.updated);
}
function scopeName() {
  if (S.q) return "Search";
  if (S.nb === "all") return "All notes";
  if (S.nb.startsWith("tag:")) return "#" + S.nb.slice(4);
  return nbById[S.nb]?.name || "Notes";
}
function when(t) {
  const h = (NOW - t) / 3600e3;
  if (h < 1) return "Just now";
  if (h < 24) return Math.round(h) + "h ago";
  if (h < 48) return "Yesterday";
  const d = new Date(t);
  if (h < 24 * 6) return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
function hl(s) {
  const q = S.q.trim(); if (!q) return esc(s);
  let out = esc(s);
  for (const w of q.split(/\s+/).filter(Boolean)) out = out.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>");
  return out;
}
const linkCount = (n) => n.links.length + backlinksOf(n.id).length;
function progress(n, withText = true) {
  const { total, done } = n.tasks; if (!total) return "";
  const pct = Math.round((done / total) * 100);
  return `<span class="bar ${done === total ? "done" : ""}"><i style="width:${pct}%"></i></span>${withText ? `<span class="num">${done}/${total}</span>` : ""}`;
}

function cardHTML(n, showNb) {
  const sub = n.headings.length >= 2
    ? `<span class="outline">${ico("outline", "ico-s ol-ico")}${n.headings.map((h, i) => (i ? '<span class="sep"></span>' : "") + `<span>${esc(h.text)}</span>`).join("")}</span>`
    : hl(n.snippet || "No text yet");
  const lc = linkCount(n);
  const nbName = nbById[n.nb]?.name;
  const max = !n.images[0] ? 2 : showNb ? 0 : 1;
  const tags = n.tags.slice(0, max).map((t) => `<span class="chip">${hl(t)}</span>`).join("") + (max && n.tags.length > max ? `<span class="chip">+${n.tags.length - max}</span>` : "");
  return `<div class="card" role="option" id="c-${n.id}" data-note="${n.id}" aria-selected="${S.n === n.id}">
    <span class="card-shape">${shapeSVG(n, 1.27)}</span>
    <span class="card-main">
      <span class="card-top"><span class="card-title ${n.title === "Untitled" || !n.title ? "untitled" : ""}">${hl(n.title || "Untitled")}</span><span class="card-time num"><span class="pending ${pendingIds.has(n.id) ? "on" : ""}" title="Waiting to sync"></span>${when(n.updated)}</span></span>
      <span class="card-sub">${sub}</span>
      <span class="card-facts">
        <span class="slot-tasks" title="${n.tasks.total ? n.tasks.done + " of " + n.tasks.total + " done" : ""}">${progress(n)}</span>
        <span class="slot-links" title="${lc ? n.links.length + " out, " + (lc - n.links.length) + " in" : ""}">${lc ? ico("link", "ico-s") + `<span class="num">${lc}</span>` : ""}</span>
        <span class="chips">${showNb ? `<span class="nb-label">${esc(nbName)}</span>` : ""}${tags}</span>
      </span>
    </span>
    ${n.images[0] ? `<span class="card-thumb" title="${esc(n.images[0].caption)}">${n.images[0].svg}</span>` : ""}
  </div>`;
}
function renderList() {
  const list = visibleNotes();
  const showNb = S.nb === "all" || !!S.q || S.nb === "fx-nb-work";
  const sub = S.q ? `${list.length} ${list.length === 1 ? "note" : "notes"}` : `${list.length} notes`;
  let body;
  if (!list.length) body = `<div class="empty">No notes match “${esc(S.q)}”. Press Esc to clear.</div>`;
  else {
    const groups = [["Today", (t) => NOW - t < 24 * 3600e3], ["This week", (t) => NOW - t < 7 * 24 * 3600e3], ["Earlier", () => true]];
    const seen = new Set(); body = "";
    for (const [label, test] of groups) {
      const g = list.filter((n) => !seen.has(n.id) && test(n.updated)); g.forEach((n) => seen.add(n.id));
      if (g.length) body += `<div class="group-label">${label}</div>` + g.map((n) => cardHTML(n, showNb)).join("");
    }
  }
  const listEl = $("#list");
  const prevScroll = listEl.querySelector(".cards")?.scrollTop || 0;
  const hadFocus = document.activeElement?.id === "q";
  const caret = hadFocus ? document.activeElement.selectionStart : null;
  listEl.innerHTML = `
    <div class="list-head">
      <div class="list-title"><h1>${esc(scopeName())}</h1><span class="sub num">${sub}</span><span class="sort">Updated ${ico("down", "ico-s")}</span></div>
      <label class="search">${ico("search")}<input id="q" placeholder="Search notes" value="${esc(S.q)}" autocomplete="off" spellcheck="false"><kbd>/</kbd></label>
    </div>
    <div class="cards" id="cards" role="listbox" tabindex="0" aria-label="${esc(scopeName())}">${body}</div>`;
  listEl.querySelector(".cards").scrollTop = prevScroll;
  if (hadFocus) { const q = $("#q"); q.focus(); q.setSelectionRange(caret, caret); }
}
