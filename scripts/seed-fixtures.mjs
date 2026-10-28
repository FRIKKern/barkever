#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const dataset = process.argv[2] ?? "fixtures";
if (dataset === "production") { console.error("seed-fixtures: refusing to seed production"); process.exit(1); }

const cfg = JSON.parse(readFileSync(`${homedir()}/.config/barkpark/config.json`, "utf8"));
const base = `${cfg.server}/w/barkever/p/default`;
const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" }, body: body && JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
};

for (const name of ["notebook", "note"]) {
  await call("POST", `/v1/schemas/${dataset}`, JSON.parse(readFileSync(new URL(`../contracts/barkpark/${name}.json`, import.meta.url))));
}

const docs = readFileSync(new URL("../fixtures/notes.ndjson", import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
for (let i = 0; i < docs.length; i += 25) {
  const batch = docs.slice(i, i + 25);
  await call("POST", `/v1/data/mutate/${dataset}`, { mutations: batch.flatMap((d) => [{ createOrReplace: d }, { publish: { id: d._id, type: d._type } }]) });
}
console.log(`seed-fixtures: ${docs.length} docs → barkever/${dataset}`);
