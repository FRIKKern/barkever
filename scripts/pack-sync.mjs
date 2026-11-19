#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { COPIED, PACK_DIR, REPORT, compare, rowsMoved, selfCheck, sourceDir, sourceNote, sourcePack } from "./pack.mjs";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { commit: { type: "string" } } });
if (positionals.length !== 1) {
  console.error("usage: node scripts/pack-sync.mjs <barkpark checkout> [--commit <sha>]");
  process.exit(2);
}
const fail = (message) => {
  console.error(`pack-sync: ${message}`);
  process.exit(1);
};

const root = fileURLToPath(new URL("..", import.meta.url));
const src = sourceDir(positionals[0]);
const source = sourcePack(src);
if (source.errors.length) fail(`Barkpark's pack at ${src} is at odds with its own stamp, nothing copied:\n${source.errors.join("\n")}`);
const commit = values.commit ?? execFileSync("git", ["-C", positionals[0], "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) fail(`not a full commit sha: ${commit}`);

const pack = join(root, PACK_DIR);
rmSync(pack, { recursive: true, force: true });
mkdirSync(join(pack, "goldens/blocks"), { recursive: true });
for (const f of Object.keys(source.files)) cpSync(join(src, COPIED[f] ?? f), join(pack, f));
writeFileSync(join(pack, "SOURCE.md"), sourceNote(commit, source.files));
const left = [...selfCheck(root), ...compare(root, src)];
if (left.length) fail(`the copy does not match its source:\n${left.join("\n")}`);

const reportPath = join(root, REPORT);
const before = existsSync(reportPath) ? readFileSync(reportPath) : undefined;
const run = spawnSync("pnpm", ["--filter", "@barkever/app", "exec", "tsx", "scripts/conformance.tsx"], { cwd: root, env: { ...process.env, CONFORMANCE_WRITE: "1" }, encoding: "utf8" });
process.stderr.write(run.stdout + run.stderr);
if (run.status !== 0 || !existsSync(reportPath)) fail("conformance did not run on the new pack (see above)");
const moved = before ? rowsMoved(JSON.parse(before), JSON.parse(readFileSync(reportPath, "utf8"))) : [];
if (moved.length) writeFileSync(reportPath, before);
for (const m of moved) {
  console.error(m.line);
  console.log(`moved: ${m.type}`);
}
console.error(`pack-sync: ${PACK_DIR} is Barkpark ${commit.slice(0, 12)}; ${moved.length ? `${moved.length} conformance rows moved, ${REPORT} kept as it was` : `no conformance row moved, ${REPORT} takes the new stamp`}`);
