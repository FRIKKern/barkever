#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { packNameCheck } from "./pack.mjs";
import { secretPatterns } from "./secrets.mjs";

export const IMG = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);
const words = (s) => s.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;

export function problems(files, read, size) {
  const errors = [];
  const fail = (f, msg) => errors.push(`${f}: ${msg}`);
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

  let imgTotal = 0;
  for (const f of files.filter((f) => IMG.has(extname(f).toLowerCase()))) {
    const bytes = size(f);
    imgTotal += bytes;
    if (!/^(reference|docs\/img)\//.test(f)) fail(f, "images live in reference/ or docs/img/ (run evidence goes on the Barkpark task)");
    if (bytes > 300 * 1024) fail(f, `${Math.round(bytes / 1024)} KB, cap 300 KB`);
  }
  if (imgTotal > 5 * 1024 * 1024) fail("images", `${Math.round(imgTotal / 1024)} KB total, cap 5 MB`);

  for (const f of files) if (size(f) > 1024 * 1024) fail(f, "over 1 MB");

  const MOST_MS = 2147483647;
  const banned = [/^next$/, /^prisma$/, /^@prisma\//, /^pg$/, /^@clerk\//, /^@tiptap\//, /^lexical$/, /^firebase$/, /^mongoose$/, /^@supabase\//];
  for (const f of files.filter((f) => f.endsWith("package.json"))) {
    const pkg = JSON.parse(read(f));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies });
    for (const d of deps) if (banned.some((re) => re.test(d))) fail(f, `banned dependency ${d} (see docs/decisions/0003, 0004)`);
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {}))
      for (const part of cmd.split(/[;&|\n]+/)) {
        if (!/(^|\s)--test(\s|$)/.test(part)) continue;
        if (!(+part.match(/\s--test-timeout=([1-9]\d*)(\s|$)/)?.[1] <= MOST_MS)) fail(f, `script "${name}" runs node --test without a --test-timeout=<1 to ${MOST_MS} ms>, so one hung test hangs the gate`);
        else if (!(+part.match(/own-tmp\.mjs --deadline=([1-9]\d*) /)?.[1] <= MOST_MS)) fail(f, `script "${name}" runs node --test outside own-tmp.mjs --deadline=<1 to ${MOST_MS} ms>, so a child holding stdout hangs the gate`);
      }
  }

  for (const f of files) {
    if (IMG.has(extname(f).toLowerCase())) continue;
    const text = read(f);
    if (secretPatterns.some((re) => re.test(text))) fail(f, "looks like a secret");
  }
  errors.push(...packNameCheck(files.filter((f) => extname(f).toLowerCase() === ".svg" || !IMG.has(extname(f).toLowerCase())), read));

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

  return errors;
}

export function typeErrors(root = ".") {
  const errors = [];
  for (const project of ["app", "mac"]) {
    try { execFileSync(join(root, project, "node_modules/.bin/tsc"), ["--noEmit", "-p", project], { cwd: root, encoding: "utf8" }); }
    catch (e) { for (const line of (e.stdout || e.message).trim().split("\n")) errors.push(`tsc -p ${project}: ${line}`); }
  }
  return errors;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });
  const errors = [...problems(files, (f) => readFileSync(f, "utf8"), (f) => statSync(f).size), ...typeErrors()];
  if (errors.length) {
    console.error(`check-repo: ${errors.length} problem(s)\n` + errors.map((e) => `  ✗ ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`check-repo: ok (${files.length} files)`);
}
