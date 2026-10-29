function renderSide() {
  const count = (id) => notes.filter((n) => n.nb === id || nbById[n.nb]?.parent === id).length;
  const open = notes.reduce((a, n) => a + n.tasks.total - n.tasks.done, 0);
  const nav = (id, label, icon, cnt, child = false) =>
    `<button class="nav ${child ? "child" : ""}" data-nb="${id}" aria-current="${S.v === "notes" && !S.q && S.nb === id}">${icon}${esc(label)}<span class="count num">${cnt}</span></button>`;
  const tags = {}; notes.forEach((n) => n.tags.forEach((t) => (tags[t] = (tags[t] || 0) + 1)));
  const topTags = Object.entries(tags).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  const roots = notebooks.filter((n) => !n.parent);
  $("#side").innerHTML = `
    <div class="brand"><svg class="brand-mark" viewBox="0 0 18 18" aria-hidden="true"><rect x="1.5" y="1.5" width="15" height="15" rx="4" fill="var(--text)"/><rect x="5" y="5" width="8" height="1.8" rx=".9" fill="var(--bg-sidebar)"/><rect x="5" y="8.4" width="5.5" height="1.4" rx=".7" fill="var(--bg-sidebar)" opacity=".7"/><rect x="5" y="11.4" width="2" height="2" rx=".5" fill="var(--bg-sidebar)"/></svg>Barkever</div>
    <button class="new-btn">${ico("plus")}New note</button>
    <div class="side-scroll">
      ${nav("all", "All notes", ico("notes"), notes.length)}
      <button class="nav" data-act="tasks" aria-current="${S.v === "tasks"}">${ico("tasks")}Tasks<span class="count num">${open}</span></button>
      <div class="side-h">Notebooks</div>
      ${roots.map((r) => nav(r.id, r.name, ico("book"), count(r.id)) + notebooks.filter((c) => c.parent === r.id).map((c) => nav(c.id, c.name, "", count(c.id), true)).join("")).join("")}
      <div class="side-h">Tags</div>
      ${topTags.map(([t, c]) => nav("tag:" + t, t, `<span class="hash">#</span>`, c)).join("")}
    </div>
    <div class="side-foot">
      <span class="sync-dot ${S.off ? "off" : ""}"></span><span>${S.off ? "Offline · 3 waiting" : "Synced"}</span>
      <button class="foot-btn" data-act="theme" title="Theme (T)">${ico(document.documentElement.dataset.theme === "dark" ? "sun" : "moon")}</button>
    </div>`;
}
