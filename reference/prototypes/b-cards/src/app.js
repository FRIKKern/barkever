const $ = (s) => document.querySelector(s);
function render() {
  const app = $("#app");
  const narrow = window.innerWidth < 720;
  const mobile = S.m || narrow;
  document.body.classList.toggle("preview-mobile", S.m && !narrow && window.innerHeight > 860);
  app.className = "app" + (S.ask && !mobile ? " has-ask" : "") + (S.v === "tasks" ? " is-board" : "") + (S.off ? " is-offline" : "") + (mobile ? " is-mobile" : "") + (mobile && S.mn ? " m-note" : "") + (mobile && S.ask ? " m-ask" : "");
  $("#banner").innerHTML = `${ico("cloudOff", "ico-s")}<span>Offline. Edits save on this Mac and sync when you’re back.</span><span class="right num">3 edits waiting</span>`;
  renderSide(); renderList(); renderMain(); renderAsk(); if (mobile) renderMobile();
  $("#states").innerHTML = `<span class="lbl">${S.s ? esc(PRESETS[S.s].label) : "States"}</span>` + Object.keys(PRESETS).map((k) => `<button data-state="${k}" title="${k} · ${esc(PRESETS[k].label)}" aria-current="${S.s === +k}">${k}</button>`).join("");
  if (S.s === 1 && !ui.focused) { ui.focused = true; $("#cards").focus({ preventScroll: true }); }
  if (S.focus && !ui.focused) { ui.focused = true; const p = document.getElementById("b-fx-note-00-p1"); if (p) { p.focus(); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } }
  if (ui.toast) showToast();
}
function toast(msg, undo) { ui.toast = { msg, undo, t: Date.now() }; }
function showToast() {
  document.querySelector(".toast")?.remove();
  const t = ui.toast; const el = document.createElement("div"); el.className = "toast";
  el.innerHTML = `<span>${esc(t.msg)}</span>${t.undo ? `<button data-act="${t.undo}">Undo</button>` : ""}`;
  document.body.appendChild(el); ui.toast = null; setTimeout(() => el.remove(), 3200);
}
