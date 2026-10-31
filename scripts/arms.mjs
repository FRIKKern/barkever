import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const runAt = args.indexOf("--run");
const cmd = runAt < 0 ? null : args[runAt + 1];
const usage = (why) => { console.error(`arms: ${why}\nusage: node scripts/arms.mjs [base] [--run "<test command>" [--strict] [--timeout <ms>]]`); process.exit(2); };
if (runAt >= 0 && !cmd) usage("--run needs a test command");
const strict = args.includes("--strict");
const timeoutAt = args.indexOf("--timeout");
if (args.some((a) => a.startsWith("--timeout="))) usage("--timeout takes its value after a space: --timeout <ms>");
const ms = timeoutAt < 0 ? "600000" : args[timeoutAt + 1];
const timeout = Number(ms);
if (!/^[1-9]\d*$/.test(ms) || timeout > 2 ** 31 - 1) usage(`--timeout needs a whole number of ms from 1 to ${2 ** 31 - 1}, got ${ms ?? "nothing"}`);
const base = args.find((a, i) => !a.startsWith("--") && ![runAt, timeoutAt].some((f) => f >= 0 && i === f + 1)) ?? "main";
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

if (cmd) await runMutants();

async function runMutants() {
  const { baseline, mutate } = await import("./mutate.mjs");
  const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const targets = rows.filter((r) => /\.(tsx?|mjs|js)$/.test(r.where.split(":")[0])).map((r) => ({ where: resolve(top, r.where) }));
  const files = [...new Set(targets.map((t) => t.where.slice(0, t.where.lastIndexOf(":"))))];
  const dirty = files.length && execFileSync("git", ["status", "--porcelain", "--", ...files], { encoding: "utf8", cwd: top }).trim();
  if (dirty) { console.error(`arms --run: commit first, these files have changes:\n${dirty}`); process.exit(2); }
  const red = await baseline(cmd, { timeout });
  if (red) { console.error(`arms --run: the command fails on the clean tree, so no mutant can be judged:\n${red}`); process.exit(2); }
  const results = await mutate(targets, cmd, { timeout });
  const short = (w) => w.slice(top.length + 1);
  const pipe = (t) => t.replaceAll("|", "\\|");
  const is = (why) => results.filter((r) => r.why === why || (why === "killed" && r.why.startsWith("killed")));
  const likely = is("survived, likely equivalent");
  const survived = [...is("survived"), ...(strict ? likely : [])];
  const unparsed = is("does not parse");
  const bare = rows.filter((r) => !results.some((x) => short(x.where) === r.where));
  console.log(`\n| where | mutant | result | killed by |\n|---|---|---|---|\n${results.filter((r) => !likely.includes(r)).map((r) => `| ${short(r.where)} | ${pipe(r.label)} | ${r.why} | ${pipe(r.by)} |`).join("\n")}`);
  if (likely.length) console.log(`\nLikely equivalent: \`?? []\` or \`?? {}\` → \`||\` differs only when the value is '', 0 or false. ${strict ? "Counted (--strict)." : "Not counted; --strict counts them."}\n\n| where | mutant | result |\n|---|---|---|\n${likely.map((r) => `| ${short(r.where)} | ${pipe(r.label)} | survived |`).join("\n")}`);
  if (bare.length) console.log(`\nNo operator mutant: each of these needs a hand mutant.\n\n${bare.map((r) => `- ${r.where} (${r.arm}) \`${pipe(r.src)}\``).join("\n")}`);
  console.log(`\nmutants: ${results.length} run, ${is("killed").length} killed, ${survived.length} survived${strict ? "" : `, ${likely.length} likely equivalent`}, ${unparsed.length} do not parse; ${bare.length} of ${rows.length} arm rows have no operator mutant`);
  process.exit(survived.length ? 1 : 0);
}
