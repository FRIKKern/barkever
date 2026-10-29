let ASK = [];

function demoAsk() {
  return [
    {
      q: "What did we decide about the Harbor carousel?",
      parts: [
        "Round two of the wireframes dropped it", { c: "fx-note-02", qt: "Three wireframe rounds. Round two dropped the carousel." },
        ", and the week 41 sync made it a decision: drop the carousel", { c: "fx-note-10", qt: "Decision: drop the carousel." },
        ". The wireframes were signed off in week 43", { c: "fx-note-12", qt: "Harbor wireframes signed off." }, ".",
      ],
    },
    {
      q: "What's the hotel budget for Design Days?",
      nf: true,
      searched: ["hotel", "budget", "Design Days"],
      parts: [
        "Design Days is two days of talks in Oslo", { c: "fx-note-46", qt: "Two days of talks in Oslo, one workshop." },
        ", and Kari asked to follow up on the conference budget", { c: "fx-note-16", qt: "Follow up on the conference budget." },
        ", but no amount is written down anywhere.",
      ],
    },
  ];
}

function answerHTML(m) {
  const cites = m.parts.filter((p) => typeof p === "object");
  const order = [...new Set(cites.map((p) => p.c))];
  const quote = Object.fromEntries(cites.map((p) => [p.c, p.qt]));
  const num = (id) => order.indexOf(id) + 1;
  const text = m.parts.map((p) => typeof p === "string" ? esc(p)
    : `<button class="cite" data-cite="${p.c}" data-qt="${esc(p.qt)}" title="${esc(byId[p.c].title)}">${num(p.c)}</button>`).join("");
  const src = (id) => `<div class="src" data-cite="${id}" data-qt="${esc(quote[id])}"><span class="k">${num(id)}</span>
    <span class="t">${esc(byId[id].title)} <span>· ${esc(nbName(byId[id].notebook._ref))}</span></span><span class="qt">“${esc(quote[id])}”</span></div>`;
  const lead = m.nf ? "Checked your notes" : `From ${order.length} notes`;
  const verdict = m.nf ? `<div class="verdict">${ic("nf")}Not in your notes</div>` : "";
  const searched = m.nf ? `<div class="searched">${ic("search")}Searched ${NOTES.length} notes for ${m.searched.map((s) => `“${esc(s)}”`).join(", ")}</div>` : "";
  return `<div class="q">${esc(m.q)}</div>
    <div class="a ${m.nf ? "nf" : ""}"><div class="lead">${ic("spark")}${lead}</div>${verdict}<div>${text}</div>
      <div class="srcs">${order.map(src).join("")}</div>${searched}</div>`;
}

function askHTML() {
  return `<aside class="ask">
    <div class="ask-h">${ic("spark")}Ask your notes<span class="chip scope">${ic("notes")}All notebooks</span><button class="ib" data-act="ask" title="Close (Esc)">${ic("x")}</button></div>
    <div class="ask-meta"><span>Claude · your login · ~1.4k tokens per answer</span><span class="on" data-act="aioff" title="Turn AI off">AI on<span class="sw"></span></span></div>
    <div class="ask-body" id="askbody">${ASK.map(answerHTML).join("")}</div>
    <div class="ask-in"><div class="box"><textarea placeholder="Ask about your notes…" rows="2"></textarea><button class="ib" title="Ask">${ic("send")}</button></div>
      <div class="note">${ic("lock")}Reads notes, never edits them. Note text is data, not instructions.</div></div>
  </aside>`;
}
