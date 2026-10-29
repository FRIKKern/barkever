const P = {
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  link: '<path d="M6.5 9.5 9.5 6.5"/><path d="M7 4.5 8.2 3.3a2.6 2.6 0 0 1 3.7 3.7L10.7 8.2"/><path d="M9 11.5 7.8 12.7a2.6 2.6 0 0 1-3.7-3.7L5.3 7.8"/>',
  check: '<path d="M3.5 8.5 6.5 11.5 12.5 4.5"/>',
  book: '<path d="M3 3.5h4a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 0 7 11.5H3z"/><path d="M13 3.5H9.5A1.5 1.5 0 0 0 8 5v8a1.5 1.5 0 0 1 1.5-1.5H13z"/>',
  notes: '<rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3"/>',
  tasks: '<rect x="2.5" y="3" width="4" height="4" rx="1"/><path d="M8.5 5h5"/><rect x="2.5" y="9" width="4" height="4" rx="1"/><path d="M8.5 11h5M3.5 5l.9.9 1.4-1.6"/>',
  spark: '<path d="M8 2.5 9.2 6.8 13.5 8 9.2 9.2 8 13.5 6.8 9.2 2.5 8 6.8 6.8Z" fill="currentColor" stroke="none"/><path d="M12.5 2v2.5M11.25 3.25h2.5" />',
  chevron: '<path d="M6 4l4 4-4 4"/>', down: '<path d="M4 6l4 4 4-4"/>', back: '<path d="M10 3.5 5.5 8l4.5 4.5"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>', moon: '<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  outline: '<path d="M3 4h10M5 8h8M7 12h6"/>', arrowUp: '<path d="M8 13V3.5M4 7.5 8 3.5l4 4"/>', jump: '<path d="M6 4h6v6M12 4 4.5 11.5"/>',
  hash: '<path d="M6 2.5 5 13.5M11 2.5 10 13.5M3 6h10.5M2.5 10H13"/>', cloudOff: '<path d="M4.5 12.5h7a2.5 2.5 0 0 0 .6-4.9A4 4 0 0 0 5 6.4a3 3 0 0 0-.5 6.1Z"/><path d="M2.5 2.5l11 11"/>',
  dots: '<circle cx="4" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12" cy="8" r=".9" fill="currentColor"/>',
  undo: '<path d="M5.5 4 2.5 7l3 3"/><path d="M2.5 7h7a3.5 3.5 0 0 1 0 7H8"/>', menu: '<path d="M3 4.5h10M3 8h10M3 11.5h10"/>',
};
const ico = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 16 16" aria-hidden="true">${P[n]}</svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
