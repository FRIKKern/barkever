window.addEventListener("popstate", () => { Object.assign(S, parseRoute(location.hash), { state: 0 }); render(); });
window.addEventListener("resize", () => {
  if (S.frame || S.mobile === innerWidth < 600) return;
  S.mobile = innerWidth < 600;
  render();
});

S.theme = new URLSearchParams(location.search).get("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const preset = location.hash.match(/s=(\d)/);
if (preset) applyState(+preset[1]);
else {
  if (location.hash.startsWith("#/")) Object.assign(S, parseRoute(location.hash), { state: 0 });
  S.mobile = innerWidth < 600;
  history.replaceState(null, "", route());
  render();
}
