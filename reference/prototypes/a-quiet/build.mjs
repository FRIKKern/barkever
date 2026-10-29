#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fixtureData } from "./fixture-data.mjs";

const here = new URL("./", import.meta.url);
const read = (f) => readFileSync(new URL(`src/${f}`, here), "utf8");

const CSS = ["tokens", "base", "frame", "sidebar", "list", "editor", "ai", "conflict", "wide", "chrome", "mobile"];
const JS = ["data", "icons", "util", "state", "sidebar", "list", "editor", "ask", "aiedit", "conflict", "tasks", "wide", "render", "nav", "events", "keys", "main"];

const data = fixtureData(new URL("../../../fixtures/notes.ndjson", here));
const json = JSON.stringify(data).replace(/</g, "\\u003c");
const html = read("shell.html")
  .replace("{{css}}", () => CSS.map((f) => read(`${f}.css`)).join(""))
  .replace("{{data}}", () => json)
  .replace("{{js}}", () => '"use strict";\n' + JS.map((f) => read(`${f}.js`)).join(""));

writeFileSync(new URL("index.html", here), html);
console.log(`a-quiet: index.html, ${data.notes.length} notes, ${Math.round(html.length / 1024)} KB`);
