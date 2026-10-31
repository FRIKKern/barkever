import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const OPEN = "([{";
const CLOSE = ")]}";
const QUOTE = "'\"`";
const WORD = /[\w$.!]/;

function skipQuote(s, i, step) {
  const q = s[i];
  for (let j = i + step; j >= 0 && j < s.length; j += step) if (s[j] === q && s[j - 1] !== "\\") return j;
  return -1;
}

function leftOperand(s, at) {
  let i = at - 1;
  while (s[i] === " ") i--;
  const end = i + 1;
  let depth = 0;
  for (; i >= 0; i--) {
    const c = s[i];
    if (QUOTE.includes(c)) { i = skipQuote(s, i, -1); if (i < 0) return null; continue; }
    if (CLOSE.includes(c)) { depth++; continue; }
    if (OPEN.includes(c)) { if (!depth) break; depth--; continue; }
    if (depth) continue;
    if (c === "?" && s[i + 1] === ".") continue;
    if (!WORD.test(c)) break;
  }
  return end > i + 1 ? { from: i + 1, to: end } : null;
}

function rightOperand(s, at) {
  let i = at;
  while (s[i] === " ") i++;
  const from = i;
  let depth = 0;
  for (; i < s.length; i++) {
    const c = s[i];
    if (QUOTE.includes(c)) { i = skipQuote(s, i, 1); if (i < 0) return null; continue; }
    if (OPEN.includes(c)) { depth++; continue; }
    if (CLOSE.includes(c)) { if (!depth) break; depth--; continue; }
    if (depth) continue;
    if (c === "?" && s[i + 1] === ".") { i++; continue; }
    if (!WORD.test(c)) break;
  }
  return depth || i === from ? null : { from, to: i };
}

function closing(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (QUOTE.includes(c)) { i = skipQuote(s, i, 1); if (i < 0) return -1; continue; }
    if (OPEN.includes(c)) depth++;
    else if (CLOSE.includes(c) && !--depth) return i;
  }
  return -1;
}

const EMPTY = new Set(["[]", "{}"]);
function strings(s) {
  const inside = new Set();
  for (let i = 0; i < s.length; i++) {
    if (!QUOTE.includes(s[i])) continue;
    const end = skipQuote(s, i, 1);
    if (end < 0) break;
    for (let j = i; j <= end; j++) inside.add(j);
    i = end;
  }
  return inside;
}

const code = (s, re) => {
  const inside = strings(s);
  return [...s.matchAll(re)].filter((m) => !inside.has(m.index));
};

const splice = (s, from, to, text) => s.slice(0, from) + text + s.slice(to);

function fallbacks(s) {
  const out = [];
  for (const m of code(s, /\|\||\?\?/g)) {
    if (s[m.index + 2] === "=") continue;
    const op = m[0];
    const l = leftOperand(s, m.index);
    const r = rightOperand(s, m.index + 2);
    if (!l || !r) continue;
    const [a, b] = [s.slice(l.from, l.to), s.slice(r.from, r.to)];
    const other = op === "||" ? "??" : "||";
    out.push({ label: `\`${op}\` → \`${other}\` in \`${a} ${op} ${b}\``, line: splice(s, l.from, r.to, `(${a} ${other} ${b})`), likely: op === "??" && EMPTY.has(b) });
    out.push({ label: `swap \`${a} ${op} ${b}\``, line: splice(s, l.from, r.to, `(${b} ${op} ${a})`) });
    out.push({ label: `drop \`${op} ${b}\``, line: splice(s, l.from, r.to, a) });
  }
  return out;
}

const SWAPS = [
  [/===|!==/g, { "===": "!==", "!==": "===" }],
  [/(?<=\s)(?:<=|<|>=|>)(?=\s)/g, { "<": "<=", "<=": "<", ">": ">=", ">=": ">" }],
  [/\.(?:startsWith|endsWith)\(/g, { ".startsWith(": ".includes(", ".endsWith(": ".includes(" }],
];

function around(s, m) {
  const l = leftOperand(s, m.index);
  if (m[0].endsWith("(")) return s.slice(l ? l.from : m.index, closing(s, m.index + m[0].length - 1) + 1 || undefined);
  const r = rightOperand(s, m.index + m[0].length);
  return [l && s.slice(l.from, l.to), m[0].trim(), r && s.slice(r.from, r.to)].filter(Boolean).join(" ");
}

function swaps(s) {
  return SWAPS.flatMap(([re, to]) =>
    code(s, re).map((m) => ({ label: `\`${m[0].trim()}\` → \`${to[m[0]].trim()}\` in \`${around(s, m)}\``, line: splice(s, m.index, m.index + m[0].length, to[m[0]]) })),
  );
}

function predicates(s) {
  const out = [];
  for (const m of code(s, /\.(filter|find|findIndex|some|every)\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = closing(s, open);
    if (close < 0) continue;
    const arg = s.slice(open + 1, close);
    const arrow = arg.indexOf("=>");
    const line = arrow < 0 ? splice(s, open + 1, close, "() => true") : splice(s, open + 1 + arrow + 2, close, " true");
    out.push({ label: `${m[1]} predicate → \`true\``, line });
  }
  return out;
}

export const mutantsOf = (line) => [...fallbacks(line), ...swaps(line), ...predicates(line)].filter((m) => m.line !== line);

const NAMES = [/^\s*not ok \d+ - (.+?)(?:\s+#.*)?$/, /^\s*✖ (.+?)(?: \([\d.]+m?s\))?$/, /^\s*[×✗] (.+?)(?: \d+ms)?$/, /^\s*FAIL\s+(.+)$/];

export function killers(output) {
  const names = new Set();
  for (const text of output.split("\n"))
    for (const re of NAMES) {
      const name = text.match(re)?.[1]?.trim();
      if (name && !name.endsWith(":")) names.add(name);
    }
  return [...names];
}

let live = null;
const restore = () => {
  if (!live) return;
  writeFileSync(live.path, live.original);
  live = null;
};
let child = null;
const stop = () => {
  if (child) try { process.kill(-child.pid, "SIGKILL"); } catch {}
};
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"])
  process.on(sig, () => {
    stop();
    restore();
    process.exit(130);
  });
process.on("exit", restore);

const runOnce = (cmd, timeout) =>
  new Promise((resolve) => {
    let out = "";
    child = spawn("sh", ["-c", cmd], { stdio: ["ignore", "pipe", "pipe"], detached: true });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      child = null;
      resolve({ code, timedOut, out });
    });
  });

export async function baseline(cmd, { timeout = 600_000 } = {}) {
  const { code, timedOut, out } = await runOnce(cmd, timeout);
  return code === 0 && !timedOut ? null : out.trim().split("\n").slice(-20).join("\n") || (timedOut ? "timed out" : `exit ${code}`);
}

const verdict = (m, { code, timedOut, out }) =>
  timedOut ? "killed (timeout)" : code === 0 ? (m.likely ? "survived, likely equivalent" : "survived") : /SyntaxError|TS1\d{3}/.test(out) && !killers(out).length ? "does not parse" : "killed";

export async function mutate(rows, cmd, { timeout = 600_000 } = {}) {
  const results = [];
  for (const { where } of rows) {
    const [path, n] = [where.slice(0, where.lastIndexOf(":")), Number(where.slice(where.lastIndexOf(":") + 1))];
    const original = readFileSync(path, "utf8");
    const lines = original.split("\n");
    for (const m of mutantsOf(lines[n - 1])) {
      live = { path, original };
      try {
        writeFileSync(path, [...lines.slice(0, n - 1), m.line, ...lines.slice(n)].join("\n"));
        const run = await runOnce(cmd, timeout);
        const why = verdict(m, run);
        results.push({ where, label: m.label, why, by: killers(run.out).slice(0, 2).join("; ") });
        console.error(`${why.padEnd(24)} ${where} ${m.label}`);
      } finally {
        restore();
      }
    }
  }
  return results;
}
