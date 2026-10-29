function fitVB(box) {
  const svg = $("#msvg"); const W = svg.clientWidth, H = svg.clientHeight;
  const room = S.mapSel && W > 900 ? W - 330 : W;
  const b = box || { x: -30, y: -30, w: MAP.W + 60, h: MAP.H + 60 };
  const k = Math.min(room / b.w, H / b.h, box ? 2.2 : 1.35);
  S.vb = { x: b.x + b.w / 2 - room / k / 2, y: b.y + b.h / 2 - H / k / 2, w: W / k, h: H / k };
}

function renderMap() {
  $("#mapov").classList.toggle("open", S.map);
  if (!S.map) return;
  const svg = $("#msvg"); if (!S.vb) fitVB();
  svg.setAttribute("viewBox", `${S.vb.x} ${S.vb.y} ${S.vb.w} ${S.vb.h}`);
  svg.innerHTML = mapSVG({ mode: "full", sel: S.mapSel, hov: S.mapHov, q: S.mapQ, scale: svg.clientWidth / S.vb.w, prefix: "fm" });
  $("#mapstat").textContent = `${NOTES.length} notes · ${NB.length} notebooks · ${linkCount()} links`;
  $("#mchips").innerHTML = NB.map((nb) => `<button class="mchip" data-zoomnb="${nb._id}">${nbDot(nb._id)}${esc(nb.name)}</button>`).join("");
  renderMapCard();
}

function renderMapCard() {
  const card = $("#mcard"), n = byId[S.mapSel];
  card.hidden = !n; if (!n) return;
  const ns = nbrs(n._id);
  const chips = ns.map((id) => `<button data-mapsel="${id}">${nbDot(byId[id].notebook._ref)}${esc(byId[id].title)}</button>`).join("");
  card.innerHTML = `<span class="nbline">${nbDot(n.notebook._ref)}${esc(nbPath(n.notebook._ref).join(" › "))} · ${fmtDate(n._updated)}</span><h3>${esc(n.title)}</h3><p>${esc(sentences(n).slice(0, 2).join(" ") || snippet(n))}</p>
    <div class="stat"><span><b>${backs(n._id).length}</b>linked from</span><span><b>${outs(n._id).length}</b>links to</span></div>
    ${ns.length ? `<div class="nbrs">${chips}</div>` : `<p class="muted">No links yet.</p>`}
    <button class="btn primary" data-act="mapopen">Open note</button>`;
}

function openMap() { S.map = true; S.mapSel = S.noteId; S.vb = null; renderMap(); }
function closeMap() { S.map = false; renderMap(); }

function wireMap() {
  const svg = $("#msvg"); let drag = null, moved = false, lastClick = 0;
  const setVB = () => svg.setAttribute("viewBox", `${S.vb.x} ${S.vb.y} ${S.vb.w} ${S.vb.h}`);
  svg.addEventListener("wheel", (e) => {
    e.preventDefault(); const r = svg.getBoundingClientRect();
    const k = Math.min(Math.max(S.vb.w * Math.exp(e.deltaY * 0.0016), 300), MAP.W * 3) / S.vb.w;
    const wx = S.vb.x + (e.clientX - r.left) / r.width * S.vb.w, wy = S.vb.y + (e.clientY - r.top) / r.height * S.vb.h;
    S.vb = { x: wx - (wx - S.vb.x) * k, y: wy - (wy - S.vb.y) * k, w: S.vb.w * k, h: S.vb.h * k };
    renderMap();
  }, { passive: false });
  svg.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, vb: S.vb }; moved = false; });
  addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) { moved = true; svg.classList.add("drag"); }
    if (!moved) return;
    const r = svg.getBoundingClientRect();
    S.vb = { ...drag.vb, x: drag.vb.x - dx * drag.vb.w / r.width, y: drag.vb.y - dy * drag.vb.h / r.height }; setVB();
  });
  addEventListener("pointerup", () => { drag = null; svg.classList.remove("drag"); });
  svg.addEventListener("pointerup", (e) => {
    if (moved) return;
    const id = e.target.closest("[data-mid]")?.dataset.mid || null;
    const again = id && id === S.mapSel && e.timeStamp - lastClick < 450;
    lastClick = e.timeStamp;
    if (again) { closeMap(); return openNote(id); }
    S.mapSel = id; renderMap();
  });
  svg.addEventListener("mouseover", (e) => { const id = e.target.closest("[data-mid]")?.dataset.mid || null; if (id !== S.mapHov) { S.mapHov = id; renderMap(); } });
  svg.addEventListener("mouseleave", () => { S.mapHov = null; renderMap(); });
  $("#mq").addEventListener("input", (e) => { S.mapQ = e.target.value; renderMap(); });
}
