import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "main";
const code = /\.(tsx?|mjs|js|exs?|go)$/;
const isTest = /(^|\/)(test|tests)\/|\.(test|spec)\.|_test\.(exs|go)$/;

const rules = [
  { arm: "fallback", re: /\?\?|\|\|(?!=)|\b_\s*->|\btrue\s*->|\bdefault:|catch\s*(\(\w*\))?\s*\{\s*\}/ },
  { arm: "guard", re: /\.(filter|find|findIndex|some|every)\(|\bEnum\.(filter|reject|find)\b|\bwhere:/ },
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

const rank = (r) => ["fallback", "guard"].indexOf(r.arm) >>> 0;
console.log(`| where | arm | code | mutant | test that fails |\n|---|---|---|---|---|`);
for (const r of rows.sort((a, b) => rank(a) - rank(b))) console.log(`| ${r.where} | ${r.arm} | \`${r.src.replaceAll("|", "\\|")}\` | | |`);
const count = (arm) => rows.filter((r) => r.arm === arm).length;
console.log(`\narms: ${rows.length} new (${count("fallback")} fallback, ${count("guard")} guard). Each row needs a mutant and the named test that kills it; a guard also needs boundary mutants (a neighbour value, off by one, a flipped sign); a fallback with no killing test gets cut.`);
