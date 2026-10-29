function shapeSVG(n, scale = 1) {
  const W = 22, H = 30, pad = 3.2, iw = W - pad * 2; let y = pad + .4; const out = [];
  const rows = [];
  for (const b of n.blocks) {
    if (b.type === "heading") rows.push({ k: "h", w: .45 + Math.min(.4, b.text.length / 40) });
    else if (b.type === "paragraph") {
      const link = b.content.some((x) => x.type === "wikilink"); const len = inlineText(b.content).length;
      if (link) rows.push({ k: "link" });
      else { const lines = len > 64 ? 2 : 1; for (let i = 0; i < lines; i++) rows.push({ k: "p", w: i < lines - 1 ? 1 : .35 + ((len * 7) % 50) / 100 }); }
    } else if (b.type === "list") for (const it of b.items) rows.push(b.task ? { k: "t", on: it.checked } : { k: "li" });
    else if (b.type === "image") rows.push({ k: "img" });
  }
  const gap = { h: 3.4, p: 2.2, link: 2.2, t: 2.9, li: 2.4, img: 8.4 };
  for (const r of rows) {
    const need = gap[r.k];
    if (y + need > H - pad + .6) break;
    if (r.k === "h") { if (y > pad + 1) y += .8; out.push(`<rect class="s-ink" x="${pad}" y="${y}" width="${(iw * r.w).toFixed(1)}" height="1.7" rx=".5"/>`); y += 3.2; }
    else if (r.k === "p") { out.push(`<rect class="s-faint" x="${pad}" y="${y}" width="${(iw * r.w).toFixed(1)}" height="1" rx=".4"/>`); y += gap.p; }
    else if (r.k === "link") { out.push(`<rect class="s-faint" x="${pad}" y="${y}" width="3" height="1" rx=".4"/><rect class="s-acc" x="${pad + 3.6}" y="${y}" width="7" height="1" rx=".4"/>`); y += gap.link; }
    else if (r.k === "t") { out.push(`<rect class="${r.on ? "s-ok" : "s-box"}" x="${pad + .2}" y="${y - .3}" width="2" height="2" rx=".4"/><rect class="s-faint" x="${pad + 3.4}" y="${y + .5}" width="${(iw - 5.5).toFixed(1)}" height="1" rx=".4"/>`); y += gap.t; }
    else if (r.k === "li") { out.push(`<circle class="s-ink" cx="${pad + 1}" cy="${y + .5}" r=".6"/><rect class="s-faint" x="${pad + 2.6}" y="${y}" width="${(iw * .55).toFixed(1)}" height="1" rx=".4"/>`); y += gap.li; }
    else if (r.k === "img") { out.push(`<rect class="s-img" x="${pad}" y="${y}" width="${iw}" height="6.6" rx=".8"/>`); y += gap.img; }
  }
  return `<svg class="shape" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect class="s-paper" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="2.4" stroke-width="${1 / scale}"/>${out.join("")}</svg>`;
}
