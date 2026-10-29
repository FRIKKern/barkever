const STOP = new Set("a an and are as at be by did do does for from has have how i in is it my of on or our say said the to was we what when where which who why with about you your me can there any".split(" "));
const terms = (s) => s.toLowerCase().match(/[a-zæøå0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ing|es|s)$/, "")) ?? [];
function retrieve(q) {
  const qs = [...new Set(terms(q))];
  if (!qs.length) return [];
  const hits = [];
  for (const n of D.notes) for (const b of n.blocks) {
    if (b.type === "heading") continue;
    const t = b.type === "paragraph" ? txt(b.content) : blockText(b);
    if (/^See /.test(t)) continue;
    const words = new Set([...terms(t), ...terms(n.title)]);
    const score = qs.filter((w) => words.has(w)).length + qs.filter((w) => terms(t).includes(w)).length * 0.5;
    if (score) hits.push({ n, b, t, score });
  }
  return hits.sort((a, b) => b.score - a.score).filter((h, i, arr) => h.score >= Math.max(1.5, arr[0].score * 0.6) && i < 3);
}
function answer(q) {
  const hits = retrieve(q);
  if (!hits.length) return { q, none: true, text: "Nothing in your notes answers this. I looked at titles and text in all 50 notes.", cites: [] };
  return { q, text: "From your notes:", lines: hits.map((h, i) => ({ s: h.t, c: [i + 1] })), cites: hits.map((h) => ({ id: h.n.id, blk: h.b.id, quote: h.t })) };
}
const SEED_CONVO = [
  { q: "What did the Harbor client ask for?", lines: [
      { s: "The client wants a stronger services page and likes the calm navigation.", c: [1] },
      { s: "The sitemap already splits Services into three.", c: [2] },
      { s: "Wireframes were signed off in week 43.", c: [3] }],
    cites: [{ id: "fx-note-13", blk: "fx-note-13-p0", quote: "Client wants a stronger services page." }, { id: "fx-note-01", blk: "fx-note-01-p0", quote: "Top level: Home, Services, Work, About, Contact. Services splits into three." }, { id: "fx-note-12", blk: "fx-note-12-p0", quote: "Harbor wireframes signed off." }] },
  { q: "What is our budget for Design Days?", none: true, text: "There is no amount for Design Days in your notes. The closest is a reminder to follow up on the conference budget.", cites: [{ id: "fx-note-16", blk: "fx-note-16-p1", quote: "Follow up on the conference budget." }] },
];
function renderAsk() {
  if (!S.aiOn) return `<div class="ask-h">${ic.spark} Ask<span class="grow"></span><button class="btn sm" data-act="ask-close">${ic.close}</button></div><div class="ask-b"><p class="ask-off">AI is off. Nothing leaves this Mac.</p></div><div class="ask-f"><div class="ask-note"><button class="switch" data-act="ai-toggle" aria-label="AI on"></button>AI off</div></div>`;
  const msgs = S.convo.map((m) => {
    const lines = m.lines ? `<p>${m.text ? esc(m.text) + " " : ""}</p>${m.lines.map((l) => `<p>${esc(l.s)} ${l.c.map((c) => `<span class="cite" data-cite="${m.cites[c - 1].id}" data-blk="${m.cites[c - 1].blk}">${c}</span>`).join("")}</p>`).join("")}` : "";
    const none = m.none ? `<p><span class="none">Not in your notes</span></p><p>${esc(m.text)}</p>` : "";
    const srcs = m.cites.length ? `<div class="sec-h" style="margin:10px 0 2px">${m.none ? "Closest note" : "Sources"} <em>· ${m.cites.length}</em></div><div class="srcs">${m.cites.map((c, i) => `<div class="src" data-cite="${c.id}" data-blk="${c.blk}"><span class="cite">${m.none ? "~" : i + 1}</span><div><b>${esc(byId[c.id].title)}</b><q>${esc(c.quote)}</q></div></div>`).join("")}</div>` : "";
    return `<div class="q">${esc(m.q)}</div><div class="a">${none}${lines.replace("<p></p>", "")}${srcs}<div class="a-meta">Claude · your login · ${m.cites.length + 2} notes read · ≈0.2¢</div></div>`;
  }).join("");
  return `<div class="ask-h">${ic.spark} Ask your notes<span class="grow"></span><button class="btn sm" data-act="ask-close" aria-label="Close">${ic.close}</button></div>
    <div class="ask-b" data-keep="ask">${msgs || `<p class="ask-off">Ask anything. Answers come only from your notes, with a source for every line.</p>`}</div>
    <div class="ask-f"><form class="ask-in"><input id="askq" placeholder="Ask about your notes…" autocomplete="off"><button class="btn sm primary" type="submit">Ask</button></form>
    <div class="ask-note"><button class="switch on" data-act="ai-toggle" aria-label="AI off"></button>AI on · answers cite notes · never edits</div></div>`;
}
