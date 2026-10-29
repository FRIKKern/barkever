function renderMobile() {
  const noteOpen = !!(S.n && S.mn);
  $("#mhead").innerHTML = S.ask ? `<h1><span class="spark">${ico("spark")}</span> Ask</h1>` : S.v === "tasks" ? `<h1>Tasks</h1>`
    : noteOpen ? `<button class="back" data-act="m-back">${ico("back")}${esc(scopeName())}</button><span class="right"><button>${ico("dots")}</button></span>`
    : `<h1>${esc(scopeName())} ${ico("down", "ico-s")}</h1><span class="right"><button aria-label="New note">${ico("plus")}</button></span>`;
  const tab = (id, label, icon, cur) => `<button data-act="${id}" aria-current="${cur}">${icon}${label}</button>`;
  $("#tabs").innerHTML = tab("m-notes", "Notes", ico("notes"), S.v !== "tasks" && !S.ask) + tab("tasks", "Tasks", ico("tasks"), S.v === "tasks") + tab("m-ask", "Ask", `<span class="spark">${ico("spark")}</span>`, S.ask) + tab("m-nb", "Notebooks", ico("book"), false);
}
