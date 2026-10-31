#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });

const errors = [];
const fail = (f, msg) => errors.push(`${f}: ${msg}`);
const read = (f) => readFileSync(f, "utf8");
const words = (s) => s.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;

const caps = { "README.md": 300, "AGENTS.md": 450, "JOURNEYS.md": 500, "QUALITY.md": 500 };
for (const [f, cap] of Object.entries(caps)) {
  if (!files.includes(f)) { fail(f, "missing"); continue; }
  const n = words(read(f));
  if (n > cap) fail(f, `${n} words, cap ${cap}`);
}
for (const f of files.filter((f) => /^docs\/decisions\/\d{4}-.+\.md$/.test(f))) {
  const n = words(read(f));
  if (n > 220) fail(f, `${n} words, cap 220`);
}

for (const f of files.filter((f) => f === "README.md" || /^docs\/[^/]+\.md$/.test(f))) {
  const head = read(f).split("\n").slice(0, 25).join("\n");
  if (!/```|!\[|<img|<svg/.test(head)) fail(f, "no diagram or image in the first 25 lines");
}

const IMG = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);
let imgTotal = 0;
for (const f of files.filter((f) => IMG.has(extname(f).toLowerCase()))) {
  const size = statSync(f).size;
  imgTotal += size;
  if (!/^(reference|docs\/img)\//.test(f)) fail(f, "images live in reference/ or docs/img/ (run evidence goes in the Trail)");
  if (size > 300 * 1024) fail(f, `${Math.round(size / 1024)} KB, cap 300 KB`);
}
if (imgTotal > 5 * 1024 * 1024) fail("images", `${Math.round(imgTotal / 1024)} KB total, cap 5 MB`);

for (const f of files) if (statSync(f).size > 1024 * 1024) fail(f, "over 1 MB");

const banned = [/^next$/, /^prisma$/, /^@prisma\//, /^pg$/, /^@clerk\//, /^@tiptap\//, /^lexical$/, /^firebase$/, /^mongoose$/, /^@supabase\//];
for (const f of files.filter((f) => f.endsWith("package.json"))) {
  const pkg = JSON.parse(read(f));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
  for (const d of deps) if (banned.some((re) => re.test(d))) fail(f, `banned dependency ${d} (see docs/decisions/0003, 0004)`);
}

const secret = [
  /sk-ant-[A-Za-z0-9_-]{20,}/, /sk-proj-[A-Za-z0-9_-]{20,}/, /\bsk-[A-Za-z0-9]{32,}\b/, /\bghp_[A-Za-z0-9]{30,}/,
  /\bAKIA[0-9A-Z]{16}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /(ANTHROPIC|OPENAI|CODEX)_API_KEY\s*=\s*\S+/,
];
for (const f of files) {
  if (f === "scripts/check-repo.mjs" || IMG.has(extname(f).toLowerCase())) continue;
  const text = read(f);
  if (secret.some((re) => re.test(text))) fail(f, "looks like a secret");
}

if (files.includes("JOURNEYS.md")) {
  const ids = [...read("JOURNEYS.md").matchAll(/^\| (J\d\d) \|/gm)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) fail("JOURNEYS.md", `duplicate ids ${dup.join(", ")}`);
}

const bpAddress = [/https?:\/\/[^\s'"`]*barkpark[^\s'"`]*/i, /\/v1\/data\b/];
for (const f of files.filter((f) => f.startsWith("app/src/") && !f.startsWith("app/src/server/"))) {
  const lines = read(f).split("\n");
  lines.forEach((line, i) => {
    const hit = bpAddress.map((re) => line.match(re)).find(Boolean);
    if (hit) fail(`${f}:${i + 1}`, `Barkpark address "${hit[0]}" outside app/src/server/ (see docs/decisions/0003)`);
  });
}

try { execFileSync("app/node_modules/.bin/tsc", ["--noEmit", "-p", "app"], { encoding: "utf8" }); }
catch (e) { for (const line of (e.stdout || e.message).trim().split("\n")) fail("tsc -p app", line); }

if (errors.length) {
  console.error(`check-repo: ${errors.length} problem(s)\n` + errors.map((e) => `  ✗ ${e}`).join("\n"));
  process.exit(1);
}
console.log(`check-repo: ok (${files.length} files)`);
