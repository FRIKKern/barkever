function seededThread() {
  return [
    { q: "What did we decide about the carousel?", a: `<p>It was dropped. Round two of the wireframes removed it <span class="cite" data-go="fx-note-02">1</span>, and the week 41 sync logged it as a decision <span class="cite" data-go="fx-note-10">2</span>.</p>`,
      srcs: [["fx-note-02", "Three wireframe rounds. Round two dropped the carousel."], ["fx-note-10", "Decision: drop the carousel."]], meta: "2 notes cited · 50 searched" },
    { q: "How much is the conference budget?", none: true, a: `<p>No amount is written down. The closest is a reminder to follow up on it <span class="cite" data-go="fx-note-16">1</span>.</p>`,
      srcs: [["fx-note-16", "Follow up on the conference budget."]], meta: "Closest match shown · 50 searched" },
  ];
}
const STOP = new Set("a an the of to in on for and or is are was were do did does what when where who how much many about we our my i me it this that with from be by at as any have has".split(" "));
function localAnswer(q) {
  const words = q.toLowerCase().replace(/[^a-z0-9æøå\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const hits = [];
  for (const n of notes) for (const b of n.blocks) {
    const texts = b.type === "paragraph" ? [inlineText(b.content)] : b.type === "list" ? b.items.map((i) => inlineText(itemContent(i))) : b.type === "heading" ? [] : [];
    for (const t of texts) for (const sent of t.split(/(?<=\.)\s+/)) {
      const low = (sent + " " + n.title).toLowerCase(); const score = words.filter((w) => low.includes(w)).length;
      if (score) hits.push({ n, sent, score: score + (sent.toLowerCase().includes(words[0] || "~") ? .5 : 0) });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  const need = Math.max(1, Math.ceil(words.length * .6));
  const top = []; for (const h of hits) { if (h.score < need) break; if (!top.some((t) => t.n.id === h.n.id)) top.push(h); if (top.length === 3) break; }
  if (!words.length || !top.length) return { q, none: true, a: `<p>Nothing in your notes answers that. Try other words, or check the spelling.</p>`, srcs: [], meta: "0 notes cited · 50 searched" };
  return { q, a: `<p>From your notes: ${top.map((t, i) => `${esc(t.sent.replace(/\.$/, ""))} <span class="cite" data-go="${t.n.id}">${i + 1}</span>`).join("; ")}.</p>`, srcs: top.map((t) => [t.n.id, t.sent]), meta: `${top.length} ${top.length === 1 ? "note" : "notes"} cited · 50 searched` };
}
function renderAsk() {
  const el = $("#ask"); if (!S.ask) { el.innerHTML = ""; return; }
  const th = ui.askThread || [];
  el.innerHTML = `<div class="ask-head"><span class="spark">${ico("spark")}</span><h2>Ask your notes</h2>
      <button class="switch ${ui.aiOn ? "" : "off"}" data-act="ai-toggle" title="Turn AI off">AI<i></i></button>
      <button class="foot-btn" data-act="close-ask" title="Close (Esc)">${ico("x")}</button></div>
    <div class="ask-scroll" id="askscroll">
      <div class="ask-hint">Answers only from your notes and cites each one. Never edits.</div>
      ${th.map((t) => `<div class="q">${esc(t.q)}</div><div class="a">
        ${t.none ? `<div class="label">Not in your notes</div>` : ""}${t.a}
        ${t.srcs.length ? `<div class="srcs">${t.srcs.map(([id, quote], i) => { const s = byId[id]; return `<button class="src-card" data-go="${id}"><span class="n">${i + 1}</span>${shapeSVG(s, .82)}<span><span class="t">${esc(s.title)}</span><span class="quote">“${esc(quote)}”</span></span></button>`; }).join("")}</div>` : ""}
        <div class="ask-meta">${t.meta}</div></div>`).join("")}
    </div>
    <div class="ask-input"><form id="askform"><input id="askq" placeholder="Ask about your notes…" autocomplete="off"><button class="send" aria-label="Ask">${ico("arrowUp")}</button></form>
      <div class="foot"><span>Claude · your subscription</span><span>no extra cost</span></div></div>`;
  const sc = $("#askscroll"); sc.scrollTop = sc.scrollHeight;
}
