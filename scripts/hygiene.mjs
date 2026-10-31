#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

const CODE = /\.(ts|tsx|mjs|js)$/;
const SCOPE = /^(app\/(src|e2e)|mac\/(src|e2e)|scripts|fixtures)\//;
const USERS = /^(app|mac|scripts|fixtures)\//;
const TEST = /\.test\.|\.spec\.|\/e2e\//;
const GENERIC = /(Manager|Factory|Helpers?|Utils?|Service|Provider|Wrapper|Base)\.(ts|tsx)$/;
const COMMENT = /^\s*(\/\/(?!\/ <reference)(?!\s*@ts-)|\/\*|\*(\s|\/|$))/;
const SLOP = [
  "seamless", "robust", "leverage", "comprehensive", "delve", "utilize", "streamline", "empower", "holistic",
  "synergy", "elevate", "unlock", "cutting-edge", "game-changer", "best-in-class", "world-class", "effortless",
  "in order to", "it's worth noting", "it is important to note", "plays a crucial role",
];
const PICTURE = /```|!\[|<img|<svg|^\|/m;

const tracked = () =>
  execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });

const at = (f, i) => `${f}:${i + 1}`;

export function hygiene() {
  const files = tracked();
  const code = files.filter((f) => CODE.test(f) && SCOPE.test(f) && !f.includes(".gen."));
  const users = files.filter((f) => CODE.test(f) && USERS.test(f));
  const text = Object.fromEntries(users.map((f) => [f, readFileSync(f, "utf8")]));
  const lines = Object.fromEntries(code.map((f) => [f, text[f].split("\n")]));
  const hits = (re) => code.flatMap((f) => lines[f].flatMap((l, i) => (re.test(l) ? [at(f, i)] : [])));

  const godFiles = code
    .map((f) => ({ file: f, lines: lines[f].length }))
    .filter((x) => x.lines > (TEST.test(x.file) ? 500 : 300))
    .sort((a, b) => b.lines - a.lines)
    .map((x) => `${x.file} ${x.lines}`);

  const comments = hits(COMMENT);

  const exported = code
    .filter((f) => !TEST.test(f))
    .flatMap((f) =>
      [...text[f].matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)]
        .map((m) => ({ file: f, name: m[1] })))
    .filter((d) => d.name !== "Route");
  const unusedExports = exported
    .filter((d) => !users.some((f) => f !== d.file && new RegExp(`\\b${d.name.replace(/\$/g, "\\$")}\\b`).test(text[f])))
    .map((d) => `${d.file} ${d.name}`);

  const patterns = [
    ...code.filter((f) => GENERIC.test(basename(f))).map((f) => `${f} generic name`),
    ...code
      .filter((f) => /(^|\/)index\.tsx?$/.test(f) && lines[f].filter(Boolean).every((l) => /^export .* from /.test(l)))
      .map((f) => `${f} barrel`),
    ...hits(/catch\s*(\([^)]*\))?\s*\{\s*\}/).map((h) => `${h} empty catch`),
    ...hits(/\bas any\b|:\s*any\b/).map((h) => `${h} any`),
  ];

  const docs = files.filter((f) => f.endsWith(".md") && !/^(reference|\.claude)\//.test(f) && f !== "CLAUDE.md");
  const slop = docs.flatMap((f) => {
    const t = readFileSync(f, "utf8").toLowerCase();
    const found = SLOP.filter((w) => t.includes(w));
    return found.length ? [`${f} ${found.join(", ")}`] : [];
  });
  const noPicture = docs.filter((f) => !PICTURE.test(readFileSync(f, "utf8").split("\n").slice(0, 25).join("\n")));

  const codeLines = code.filter((f) => !TEST.test(f)).reduce((n, f) => n + lines[f].length, 0);
  return {
    size: { codeFiles: code.length, codeLines, testFiles: code.filter((f) => TEST.test(f)).length },
    godFiles, comments, unusedExports, patterns, slop, noPicture,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const h = hygiene();
  console.log(`code: ${h.size.codeFiles} files, ${h.size.codeLines} non-test lines, ${h.size.testFiles} test files`);
  for (const k of ["godFiles", "comments", "unusedExports", "patterns", "slop", "noPicture"]) {
    console.log(`\n${k}: ${h[k].length}`);
    for (const x of h[k].slice(0, process.argv.includes("--all") ? Infinity : 15)) console.log(`  ${x}`);
  }
}
