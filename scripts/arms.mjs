import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "main";
const code = /\.(tsx?|mjs|js|exs?|go)$/;
const isTest = /(^|\/)(e2e|test|tests)\/|\.(test|spec)\.|_test\.(exs|go)$/;

const rules = [
  { arm: "fallback", re: /\?\?|\|\|(?!=)|\b_\s*->|\btrue\s*->|\bdefault:|catch\s*(\(\w*\))?\s*\{\s*\}/ },
  { arm: "branch", re: /\bif\s*\(|\bif\s+[^(]|\belse\b|\bcond\b|\bcase\b|\bwhen\b|\?[^.?:]+:|->\s*$/ },
  { arm: "error path", re: /\bcatch\b|\brescue\b|\.catch\(|\{:error\b|throw\b|panic\(/ },
];

const diff = execFileSync("git", ["diff", "-U0", `${base}...HEAD`], { encoding: "utf8", maxBuffer: 64 << 20 });
const rows = [];
let file = null;
let line = 0;
for (const text of diff.split("\n")) {
  if (text.startsWith("+++ ")) { file = text.slice(6); continue; }
  const hunk = text.match(/^@@ -\S+ \+(\d+)/);
  if (hunk) { line = Number(hunk[1]); continue; }
  if (!file || !code.test(file) || isTest.test(file)) continue;
  if (text.startsWith("+")) {
    const src = text.slice(1).trim();
    const hit = rules.find((r) => r.re.test(src));
    if (hit) rows.push({ where: `${file}:${line}`, arm: hit.arm, src: src.slice(0, 90) });
    line++;
  }
}

console.log(`| where | arm | code | mutant | test that fails |\n|---|---|---|---|---|`);
for (const r of rows.sort((a, b) => (b.arm === "fallback") - (a.arm === "fallback"))) console.log(`| ${r.where} | ${r.arm} | \`${r.src.replaceAll("|", "\\|")}\` | | |`);
const fallbacks = rows.filter((r) => r.arm === "fallback").length;
console.log(`\narms: ${rows.length} new (${fallbacks} fallback). Each row needs a mutant and the named test that kills it; a fallback with no killing test gets cut.`);
