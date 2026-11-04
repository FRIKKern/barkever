import { readFileSync } from "node:fs";

const tokens = JSON.parse(readFileSync(new URL("../../design/tokens.json", import.meta.url), "utf8"));
const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;

const palette = (t) => `--bg:${t["c-bg"]};--card:${t["c-surface"]};--line:${t["c-border"]};--ink:${t["c-text"]};--soft:${t["c-text-2"]};--faint:${t["c-faint"]};--ok:${t["c-ok"]};--now:${t["c-accent"]};--nowbg:${t["c-accent-soft"]};--on:${t["c-on-accent"]}`;

const style = `<style>
svg{${palette(tokens.light)}}
@media (prefers-color-scheme: dark){svg{${palette(tokens.dark)}}}
text{font-family:${FONT};fill:var(--ink)}
.soft{fill:var(--soft)}.okt{fill:var(--ok)}.nowt{fill:var(--now)}.ont{fill:var(--on)}
.caps{font-size:14px;font-weight:700;letter-spacing:1.6px}
.bg{fill:var(--bg)}.card{fill:var(--card);stroke:var(--line)}.track{fill:var(--line)}
.okf{fill:var(--ok)}.nowf{fill:var(--now)}.nowbg{fill:var(--nowbg)}
.line{stroke:var(--line);fill:none}.okl{stroke:var(--ok);fill:none}.nowl{stroke:var(--now);fill:none}.faintl{stroke:var(--faint);fill:none;stroke-dasharray:4 7;stroke-linecap:round}
.pulse{fill:var(--now);opacity:.18;transform-box:fill-box;transform-origin:center;animation:pulse 2.4s ease-out infinite}
@keyframes pulse{0%{transform:scale(.8);opacity:.3}100%{transform:scale(1.5);opacity:0}}
@media (prefers-reduced-motion: reduce){.pulse{animation:none}}
</style>`;

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function wrap(text, maxChars, maxLines = Infinity) {
  const lines = [];
  for (const word of text.split(/\s+/)) {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= maxChars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1).trimEnd()}…`;
  return kept;
}

export const say = (x, y, content, { size = 16, cls = "", weight, anchor } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}"${cls ? ` class="${cls}"` : ""}${weight ? ` font-weight="${weight}"` : ""}${anchor ? ` text-anchor="${anchor}"` : ""}>${esc(content)}</text>`;

export const svgDoc = ({ width, height, title, desc, body }) =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d">`,
    `<title id="t">${esc(title)}</title>`,
    `<desc id="d">${esc(desc)}</desc>`,
    style,
    `<rect class="bg" width="${width}" height="${height}" rx="16"/>`,
    ...body,
    `</svg>`,
    ``,
  ].join("\n");

export const count = (value, of, x, y, label) =>
  [
    `<text x="${x}" y="${y}" font-size="42" font-weight="700" text-anchor="end">${value}<tspan class="soft" font-weight="400"> / ${of}</tspan></text>`,
    say(x, y + 26, label, { size: 16, cls: "soft", anchor: "end" }),
  ].join("\n");
