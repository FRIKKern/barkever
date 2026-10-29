const MC = { dx: 132, dy: 76, padX: 66, padTop: 62, padBot: 50, gapX: 46, gapY: 46 };
const MAP_ROWS = [["fx-nb-home", "fx-nb-projects", "fx-nb-meetings", "fx-nb-travel"], ["fx-nb-inbox", "fx-nb-work", "fx-nb-reading"]];
let MAP;

function computeMap() {
  const boxes = {};
  for (const nb of NB) {
    const notes = NOTES.filter((n) => n.notebook._ref === nb._id);
    const cols = Math.max(2, Math.ceil(Math.sqrt(notes.length * 0.8)));
    const rows = Math.max(1, Math.ceil(notes.length / cols));
    boxes[nb._id] = { id: nb._id, notes, cols, rows, w: (cols - 1) * MC.dx + 2 * MC.padX, h: (rows - 1) * MC.dy + MC.padTop + MC.padBot };
  }
  const rowW = MAP_ROWS.map((r) => r.reduce((s, id) => s + boxes[id].w, 0) + MC.gapX * (r.length - 1));
  const W = Math.max(...rowW);
  let y = 0;
  MAP_ROWS.forEach((r, i) => {
    let x = (W - rowW[i]) / 2; const h = Math.max(...r.map((id) => boxes[id].h));
    for (const id of r) { const b = boxes[id]; b.x = x; b.y = y + (i === 0 ? h - b.h : 0); x += b.w + MC.gapX; }
    y += h + MC.gapY;
  });
  const pos = {};
  const centerOf = (b) => ({ x: b.x + b.w / 2, y: b.y + MC.padTop + (b.rows - 1) * MC.dy / 2 });
  for (const b of Object.values(boxes)) {
    const slots = [];
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) slots.push({ x: b.x + MC.padX + c * MC.dx, y: b.y + MC.padTop + r * MC.dy });
    const ctr = centerOf(b);
    const order = b.notes.slice().sort((a, c) => degree(c._id) - degree(a._id) || a._id.localeCompare(c._id));
    for (const n of order) {
      let best = slots[0], bestCost = Infinity;
      for (const s of slots) {
        let cost = 0.35 * Math.hypot(s.x - ctr.x, s.y - ctr.y);
        for (const m of nbrs(n._id)) {
          const other = byId[m].notebook._ref;
          const p = pos[m] || (other !== b.id ? centerOf(boxes[other]) : null);
          if (p) cost += Math.hypot(s.x - p.x, s.y - p.y);
        }
        if (cost < bestCost) { bestCost = cost; best = s; }
      }
      pos[n._id] = best; slots.splice(slots.indexOf(best), 1);
    }
  }
  MAP = { boxes, pos, W, H: y - MC.gapY };
}

function edgePath(a, b, ra, rb) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const cx = (a.x + b.x) / 2 - dy * 0.16, cy = (a.y + b.y) / 2 + dx * 0.16;
  const unit = (px, py) => { const l = Math.hypot(cx - px, cy - py) || 1; return [(cx - px) / l, (cy - py) / l]; };
  const [sx, sy] = unit(a.x, a.y), [ex, ey] = unit(b.x, b.y);
  const f = (v) => v.toFixed(1);
  return `M${f(a.x + sx * ra)} ${f(a.y + sy * ra)}Q${f(cx)} ${f(cy)} ${f(b.x + ex * rb)} ${f(b.y + ey * rb)}`;
}

const arrow = (id, color) => `<marker id="${id}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 .5 7.5 4 0 7.5z" style="fill:var(${color})"/></marker>`;
const arrowDefs = (p) => `<defs>${arrow(p + "a", "--c-edge")}${arrow(p + "h", "--c-accent")}${arrow(p + "p", "--c-add-fg")}</defs>`;
const mapR = (id, mini) => (mini ? 16 + Math.min(degree(id), 4) * 3 : 6 + Math.min(degree(id), 4) * 1.6);

function mapSVG(o) {
  const mini = o.mode === "mini", full = o.mode === "full", plain = mini || o.mode === "ask";
  const k = o.scale || 1, fs = 10.5 / k, p = o.prefix || "m";
  const lit = o.hov || o.sel;
  const litSet = lit && full ? new Set([lit, ...nbrs(lit)]) : null;
  const q = (o.q || "").trim();
  const hit = (n) => !q || matches(n, q);
  let s = mini ? "" : arrowDefs(p);
  for (const b of Object.values(MAP.boxes)) {
    const c = nbColor(b.id);
    s += `<g class="mb${o.focus && o.focus !== b.id ? " dim" : ""}"><rect class="mb-r" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="22" style="fill:${c};stroke:${c}"/>`;
    if (!plain) {
      const lfs = 12.5 / k;
      s += `<circle cx="${b.x + 22}" cy="${b.y + 24}" r="${4.5 / k}" style="fill:${c}"/><text class="mb-l" x="${b.x + 22 + 10 / k}" y="${b.y + 24 + lfs * 0.36}" style="font-size:${lfs}px">${esc(nbPath(b.id).join(" › "))}<tspan class="mb-n" dx="${6 / k}">${b.notes.length}</tspan></text>`;
    }
    s += `</g>`;
  }
  for (const n of NOTES) for (const t of outs(n._id)) {
    const a = MAP.pos[n._id], b = MAP.pos[t]; if (!a || !b || o.marks) continue;
    const on = !mini && lit && (n._id === lit || t === lit);
    const off = (litSet && !on) || (o.focus && byId[t].notebook._ref !== o.focus && n.notebook._ref !== o.focus) || (q && !(hit(n) && hit(byId[t])));
    const marker = plain ? "" : ` marker-end="url(#${p}${on ? "h" : "a"})"`;
    s += `<path class="m-edge${on ? " on" : ""}${off ? " dim" : ""}" d="${edgePath(a, b, mapR(n._id, mini) + 1, mapR(t, mini) + (mini ? 1 : 4))}"${marker}/>`;
  }
  for (const n of NOTES) {
    const at = MAP.pos[n._id]; if (!at) continue;
    const r = mapR(n._id, mini);
    const isSel = n._id === o.sel, mark = o.marks?.[n._id];
    const dim = (q && !hit(n)) || (litSet && !litSet.has(n._id)) || (o.marks && !mark);
    const near = litSet && litSet.has(n._id) && lit !== n._id;
    const label = full || (o.mode === "cluster" && n.notebook._ref === o.focus);
    s += `<g class="m-node${isSel ? " sel" : ""}${mark ? " cited" : ""}${dim ? " dim" : ""}${near ? " nb1" : ""}" data-mid="${n._id}" transform="translate(${at.x} ${at.y})">`;
    if (isSel && !mini) s += `<circle class="halo" r="${r + 9}"/>`;
    s += `<circle r="${r + 8}" fill="transparent"/><circle class="b" r="${r}" style="fill:${nbColor(n.notebook._ref)}"/>`;
    if (label) s += `<text class="lbl" text-anchor="middle" style="font-size:${fs}px;stroke-width:${3 / k}px">` + wrapLabel(n.title || "Untitled", 16).map((l, i) => `<tspan x="0" y="${r + fs * 1.25 + i * fs * 1.2}">${esc(l)}</tspan>`).join("") + `</text>`;
    if (mark) { const R = 7 / k; s += `<circle class="m-mark" cx="${r + R}" cy="${-r - R}" r="${R}"/><text class="m-mark-t" x="${r + R}" y="${-r - R + R * 0.4}" style="font-size:${R * 1.15}px">${mark}</text>`; }
    s += `</g>`;
  }
  return s;
}
