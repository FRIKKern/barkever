import { readFileSync, writeFileSync } from "node:fs";
import { applyOverlay } from "./overlay.mjs";

const here = new URL("./", import.meta.url);
const read = (path) => readFileSync(new URL(path, here), "utf8");

const css = ["tokens", "base", "layout", "list", "editor", "ai", "board", "mobile"];
const js = ["data", "icons", "shape", "state", "list", "side", "editor", "ai-edit", "ask", "board", "conflict", "mobile", "app", "events"];

const lines = read("../../../fixtures/notes.ndjson").trim().split("\n").map((l) => JSON.parse(l));
lines.filter((d) => d._type === "note").forEach(applyOverlay);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Barkever Visual Cards</title>
<style>
${css.map((f) => read(`src/${f}.css`)).join("\n")}</style>
</head>
<body>
${read("src/page.html")}<script id="fixtures" type="application/json">${JSON.stringify(lines).replace(/</g, "\\u003c")}</script>
<script>
"use strict";
${js.map((f) => read(`src/${f}.js`)).join("\n")}</script>
</body>
</html>
`;

writeFileSync(new URL("index.html", here), html);
console.log(`b-cards: ${lines.length} fixture lines, ${css.length} css + ${js.length} js parts`);
