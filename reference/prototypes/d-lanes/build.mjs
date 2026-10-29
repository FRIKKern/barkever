import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { plan } from "./plan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), "utf8");
const CSS = ["tokens", "shell", "rows", "home", "notes", "ai", "conflict", "board", "ask", "switcher", "mobile"];
const JS = ["data", "state", "helpers", "side", "home", "board", "notes", "ai-edit", "conflict", "ask", "render", "nav", "states", "events", "keys", "boot"];

const fixtures = read("../../../fixtures/notes.ndjson").trim().split("\n").map((l) => JSON.parse(l));
const data = JSON.stringify(plan(fixtures)).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Barkever · Day lanes</title>
<style>
${CSS.map((f) => read(`src/${f}.css`)).join("\n")}</style>
</head>
<body>
${read("src/shell.html")}<script>
"use strict";
const DATA = ${data};
${JS.map((f) => read(`src/${f}.js`)).join("\n")}</script>
</body>
</html>
`;
writeFileSync(join(here, "index.html"), html);
console.log(`d-lanes: index.html ${Math.round(html.length / 1024)} KB, ${fixtures.length} fixture docs`);
