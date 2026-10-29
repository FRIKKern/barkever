import { readFileSync, writeFileSync } from "node:fs";

const here = new URL("./", import.meta.url);
const read = (path) => readFileSync(new URL(path, here), "utf8");
const CSS = ["tokens", "base", "editor", "rail", "views", "mobile"];
const JS = ["data", "map", "graph", "panes", "ai-edit", "conflict", "rail", "board", "fullmap", "app", "states"];

const docs = read("../../../fixtures/notes.ndjson").trim().split("\n").map((line) => JSON.parse(line));
const parts = {
  CSS: CSS.map((f) => read(`src/${f}.css`)).join(""),
  DATA: JSON.stringify(docs).replace(/</g, "\\u003c"),
  JS: JS.map((f) => read(`src/${f}.js`)).join("\n"),
};
const html = read("src/shell.html").replace(/@@(CSS|DATA|JS)@@/g, (_, key) => parts[key]);
writeFileSync(new URL("index.html", here), html);
console.log(`c-map: index.html ${Math.round(html.length / 1024)} KB, ${docs.length} fixture docs`);
