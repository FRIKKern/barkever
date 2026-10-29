const svg = (body) => `<svg viewBox="0 0 240 150" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const box = (x, y, w, h, label, cls = "dg-box") =>
  `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>` +
  (label ? `<text class="dg-text" x="${x + w / 2}" y="${y + h / 2 + 3.5}" text-anchor="middle">${label}</text>` : "");
const elbow = (x1, y1, x2, y2) => `<path class="dg-line" d="M${x1} ${y1} V${(y1 + y2) / 2} H${x2} V${y2}"/>`;

export const diagrams = {
  "fx-note-01": {
    after: "fx-note-01-p0", kind: "diagram", caption: "Sitemap, version two",
    svg: svg(
      box(95, 10, 50, 22, "Home", "dg-acc") +
      [20, 75, 130, 185].map((x) => elbow(120, 32, x + 17, 58)).join("") +
      box(3, 58, 52, 22, "Services") + box(66, 58, 48, 22, "Work") + box(122, 58, 50, 22, "About") + box(180, 58, 56, 22, "Contact") +
      [8, 26, 44].map((x) => elbow(29, 80, x + 6, 108) + box(x, 108, 12, 26, "", "dg-faint")).join("")),
  },
  "fx-note-02": {
    after: "fx-note-02-p0", kind: "image", caption: "Wireframe, round two (carousel gone)",
    svg: svg(
      `<rect class="dg-paper" x="6" y="6" width="228" height="138" rx="6"/>` +
      `<rect class="dg-faint" x="6" y="6" width="228" height="16" rx="6"/>` +
      `<circle class="dg-ink" cx="16" cy="14" r="2.5"/><circle class="dg-ink" cx="25" cy="14" r="2.5"/>` +
      `<rect class="dg-acc" x="18" y="32" width="204" height="44" rx="3"/>` +
      `<rect class="dg-ink" x="30" y="46" width="90" height="6" rx="2"/><rect class="dg-faint" x="30" y="58" width="60" height="4" rx="2"/>` +
      [18, 88, 158].map((x) => `<rect class="dg-faint" x="${x}" y="88" width="64" height="40" rx="3"/>`).join("")),
  },
  "fx-note-07": {
    after: "fx-note-07-p0", kind: "image", caption: "Stone greys, one warm accent",
    svg: svg(
      ["#5f6366", "#8b8e8f", "#b7b5b0", "#dcd9d2", "#c46f37"]
        .map((c, i) => `<rect x="${8 + i * 46}" y="10" width="40" height="84" rx="4" fill="${c}"/>`).join("") +
      `<text class="dg-type" x="10" y="132">Aa</text><rect class="dg-faint" x="72" y="112" width="150" height="6" rx="3"/><rect class="dg-faint" x="72" y="126" width="110" height="6" rx="3"/>`),
  },
  "fx-note-17": {
    after: "fx-note-17-p0", kind: "diagram", caption: "Three bets for Q4",
    svg: svg(
      box(6, 52, 64, 40, "Harbor", "dg-acc") + box(88, 52, 64, 40, "Lighthouse") + box(170, 52, 64, 40, "Quarry") +
      `<path class="dg-line" d="M70 72 H88 M152 72 H170"/>` +
      ["launch", "beta", "identity"].map((t, i) => `<text class="dg-small" x="${38 + i * 82}" y="108" text-anchor="middle">${t}</text>`).join("")),
  },
};
