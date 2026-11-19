#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { compare, heldPack, readSourceNote, selfCheck, sourceDir } from "./pack.mjs";
import { PACK_DIR } from "./pack-door.mjs";

const { values } = parseArgs({ options: { against: { type: "string" } } });
const root = fileURLToPath(new URL("..", import.meta.url));
const errors = [...selfCheck(root), ...(values.against ? compare(root, sourceDir(values.against)) : [])];
if (errors.length) {
  console.error(`pack-compare: ${PACK_DIR} is not as the sync wrote it; run node scripts/pack-sync.mjs <barkpark checkout>, never a hand copy:\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(`pack-compare: ${PACK_DIR}: ${Object.keys(heldPack(root)).length} files as synced from Barkpark ${readSourceNote(root).commit.slice(0, 12)}${values.against ? ", same as the given checkout" : ""}`);
