const LG = { W: 340, H: 300, pos: {}, raf: 0 };

function localLayout(id, proposed) {
  const { W, H } = LG; const cx = W / 2, cy = 158;
  const nodes = [{ key: id, id, x: cx, y: cy, kind: "center", r: 10 }], edges = [];
  const ins = backs(id), right = [...outs(id), ...proposed.filter((p) => !outs(id).includes(p))];
  const left = ins.filter((x) => !right.includes(x));
  const shown = new Set([id, ...left, ...right]);
  const column = (list, x, side) => {
    const items = list.slice(0, list.length > 4 ? 3 : 4);
    const more = list.length - items.length;
    const n = items.length + (more ? 1 : 0); const gap = Math.min(70, (H - 90) / Math.max(n - 1, 1));
    items.forEach((nid, i) => {
      const y = cy + (i - (n - 1) / 2) * gap;
      const prop = side === "r" && !outs(id).includes(nid);
      nodes.push({ key: nid, id: nid, x, y, kind: prop ? "prop" : "n", r: 6 + Math.min(degree(nid), 4) * 0.8 });
      edges.push(side === "l" ? { a: nid, b: id, cls: "" } : { a: id, b: nid, cls: prop ? "prop" : "", both: ins.includes(nid) });
      const beyond = (side === "l" ? backs(nid) : outs(nid)).filter((d) => !shown.has(d)).slice(0, 3);
      beyond.forEach((d, j) => {
        shown.add(d);
        nodes.push({ key: d, id: d, x: side === "l" ? 14 : W - 14, y: y + (j - (beyond.length - 1) / 2) * 11, kind: "d2", r: 3.2 });
        edges.push(side === "l" ? { a: d, b: nid, cls: "d2" } : { a: nid, b: d, cls: "d2" });
      });
    });
    if (more) nodes.push({ key: "more-" + side, id: null, x, y: cy + (n - 1) / 2 * gap, kind: "more", r: 5, label: `+${more} more` });
  };
  column(left, 62, "l"); column(right, W - 62, "r");
  tagRelated(id, 4).filter((r) => !shown.has(r)).slice(0, 2).forEach((rid, i) => {
    nodes.push({ key: rid, id: rid, x: cx, y: i === 0 ? cy - 86 : cy + 82, kind: "tagged", r: 5 });
    edges.push({ a: id, b: rid, cls: "tagged" });
  });
  return { nodes, edges, cx, cy, empty: !left.length && !right.length };
}

function edgeD(e, A, B, a, b) {
  if (e.cls === "tagged") { const down = b.y > a.y ? 1 : -1; return `M${a.x} ${a.y + down * (A.r + 3)}L${b.x} ${b.y - down * (B.r + 3)}`; }
  const x1 = a.x + A.r + 2, x2 = b.x - B.r - 4, mx = (x1 + x2) / 2, f = (v) => v.toFixed(1);
  return `M${f(x1)} ${f(a.y)}C${f(mx)} ${f(a.y)} ${f(mx)} ${f(b.y)} ${f(x2)} ${f(b.y)}`;
}

function drawLocal(svg, L, P) {
  const { W, H } = LG;
  let s = arrowDefs("lg") + `<text class="g-cap" x="62" y="22" text-anchor="middle">LINKED FROM</text><text class="g-cap" x="${W - 62}" y="22" text-anchor="middle">LINKS TO</text>`;
  const byKey = Object.fromEntries(L.nodes.map((n) => [n.key, n]));
  for (const e of L.edges) {
    const A = byKey[e.a], B = byKey[e.b];
    const mk = e.cls === "tagged" ? "" : ` marker-end="url(#lg${e.cls === "prop" ? "p" : "a"})"${e.both ? ' marker-start="url(#lga)"' : ""}`;
    s += `<path class="g-edge ${e.cls}" data-a="${e.a}" data-b="${e.b}" d="${edgeD(e, A, B, P[e.a], P[e.b])}"${mk} style="opacity:${Math.min(P[e.a].o, P[e.b].o)}"/>`;
  }
  for (const n of L.nodes) {
    const p = P[n.key]; const note = n.id && byId[n.id];
    const color = note ? nbColor(note.notebook._ref) : "var(--c-faint)";
    s += `<g class="g-node ${n.kind}" ${n.id ? `data-open="${n.id}" data-gid="${n.id}"` : `data-act="morelinks"`} transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})" style="opacity:${p.o}">`;
    if (n.kind === "center") s += `<circle class="halo" r="${n.r + 7}"/>`;
    s += `<circle r="${n.r + 7}" fill="transparent"/><circle class="b" r="${n.r}" style="fill:${color};stroke:${n.kind === "tagged" ? color : ""}"/>`;
    if (n.kind !== "d2") {
      const lines = n.label ? [n.label] : wrapLabel(note.title || "Untitled", n.kind === "center" ? 18 : 16);
      s += `<text text-anchor="middle">` + lines.map((l, i) => `<tspan x="0" y="${n.r + 13 + i * 12.5}">${esc(l)}</tspan>`).join("") + `</text>`;
    }
    s += `</g>`;
  }
  if (L.empty) s += `<text class="g-hint" x="${W / 2}" y="${H - 14}" text-anchor="middle">No links yet</text>`;
  svg.innerHTML = s;
}

function renderLocalGraph(animate) {
  const svg = $("#lg"); if (!svg) return;
  const proposed = S.ai?.noteId === S.noteId ? S.ai.changes.filter((c) => c.link && c.status === "pending").map((c) => c.link) : [];
  const L = localLayout(S.noteId, proposed);
  const target = Object.fromEntries(L.nodes.map((n) => [n.key, { x: n.x, y: n.y, o: 1 }]));
  const from = LG.pos, origin = from[S.noteId] || { x: L.cx, y: L.cy };
  cancelAnimationFrame(LG.raf);
  const finish = () => { LG.pos = target; drawLocal(svg, L, target); if (S.tipId) showTip(S.tipId); };
  if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches || !Object.keys(from).length) return finish();
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 320), e = 1 - Math.pow(1 - k, 3);
    const P = {};
    for (const [key, to] of Object.entries(target)) {
      const f = from[key] || { ...origin, o: 0 };
      P[key] = { x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e, o: f.o + (1 - f.o) * e };
    }
    drawLocal(svg, L, P);
    if (k < 1) LG.raf = requestAnimationFrame(step); else finish();
  };
  LG.raf = requestAnimationFrame(step);
}

function hoverGraph(id) {
  const svg = $("#lg"); if (!svg) return;
  svg.classList.toggle("hov", !!id);
  $$(".g-node", svg).forEach((g) => g.classList.toggle("on", !!id && (g.dataset.gid === id || g.dataset.gid === S.noteId)));
  $$(".g-edge", svg).forEach((p) => p.classList.toggle("on", !!id && (p.dataset.a === id || p.dataset.b === id)));
  $$(".wl").forEach((w) => w.classList.toggle("hl", w.dataset.id === id));
  $$(".rel-row").forEach((r) => r.classList.toggle("hl", r.dataset.open === id));
  if (id && id !== S.noteId) showTip(id); else $("#tip").hidden = true;
}

function showTip(id) {
  const svg = $("#lg"), tip = $("#tip"); const g = svg && $(`.g-node[data-gid="${id}"]`, svg); if (!g) return;
  const n = byId[id], d = degree(id);
  const wrap = svg.parentElement.getBoundingClientRect(), dot = g.querySelector("circle.b").getBoundingClientRect();
  tip.innerHTML = `<span class="nbline"><span class="dot" style="background:${nbColor(n.notebook._ref)}"></span>${esc(nbPath(n.notebook._ref).join(" › "))} · ${d} link${d === 1 ? "" : "s"}</span><b>${esc(n.title)}</b>${esc(snippet(n))}`;
  tip.hidden = false;
  tip.style.left = Math.min(Math.max(dot.left - wrap.left - 110 + dot.width / 2, 8), wrap.width - 228) + "px";
  tip.style.top = dot.bottom - wrap.top + 34 + "px";
}
