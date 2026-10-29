const $ = (s, r = document) => r.querySelector(s);
function render() {
  const keep = {}; document.querySelectorAll("[data-keep]").forEach((el) => (keep[el.dataset.keep] = el.scrollTop));
  document.documentElement.dataset.theme = S.theme || "light";
  document.body.classList.toggle("frame", S.frame);
  const app = $("#app"); app.classList.toggle("m", S.mobile);
  $("#side").innerHTML = S.mobile ? "" : renderSide();
  const crumbs = S.view === "home" ? "Home" : S.view === "board" ? `Board${S.board !== "all" ? ` <span class="sep">›</span> ${esc(prById[S.board].name)}` : ""}` : `Notes <span class="sep">›</span> ${esc(ctxName(S.ctx))}`;
  $("#crumb").innerHTML = crumbs;
  $("#topr").innerHTML = S.aiOn ? `<button class="btn ${S.ask ? "on" : ""}" data-act="ask" title="Ask your notes">${ic.spark} Ask</button>` : "";
  $("#banner").innerHTML = S.offline ? `<div class="banner"><i class="dot"></i>Offline · edits save on this Mac and sync when you’re back<button data-act="online">Try now</button></div>` : "";
  $("#view").innerHTML = S.view === "home" ? renderHome() : S.view === "board" ? renderBoard() : renderNotes();
  const ask = $("#ask"); ask.hidden = !S.ask; ask.innerHTML = S.ask ? renderAsk() : "";
  $("#tabbar").innerHTML = [["home", ic.home, "Home"], ["notes", ic.notes, "Notes"], ["board", ic.board, "Board"], ["ask", ic.spark, "Ask"]].map(([v, i, l]) => `<button class="${(v === "ask" ? S.ask : S.view === v && !S.ask) ? "on" : ""}" data-tab="${v}">${i}${l}</button>`).join("");
  $("#switcher").innerHTML = `<button class="on" title="Prototype state (keys 1–8)">${S.state || "·"}</button><span class="rest">${["Home lanes", "Note open", "Ask", "AI Edit", "Board", "Offline", "Conflict", "Mobile"].map((l, i) => `<button data-state="${i + 1}" title="${i + 1} · ${l}">${i + 1}</button>`).join("")}<button data-act="theme" title="Light or dark">◐</button></span>`;
  $("#layer").innerHTML = S.toast ? `<div class="toast">${esc(S.toast.text)}${S.toast.undo ? `<button data-act="undo">Undo</button>` : ""}${S.toast.open ? `<button data-open="${S.toast.open}">Open it</button>` : ""}</div>` : "";
  document.querySelectorAll("[data-keep]").forEach((el) => { if (keep[el.dataset.keep] != null) el.scrollTop = keep[el.dataset.keep]; });
  if (S.flash) {
    const el = document.getElementById("line-" + S.flash.replace(":", "-")) || document.getElementById("blk-" + S.flash);
    if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("flash"); }
    S.flash = null;
  }
  const sel = $(".nrow.on"); if (sel && S.view === "notes") sel.scrollIntoView({ block: "nearest" });
}
let toastTimer;
function toast(text, opts = {}) { S.toast = { text, ...opts }; clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = null; render(); }, 6000); }
