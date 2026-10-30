import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { killers, mutate, mutantsOf } from "./mutate.mjs";

const lines = (s) => mutantsOf(s).map((m) => m.line);

test("a fallback gets ?? for ||, its operands swapped, and its fallback dropped, each in parens", () => {
  const s = "  return c.map((x) => x.value || x.text || inline(x.children ?? [], title)).join('')";
  assert.deepEqual(lines(s).slice(0, 3), [
    "  return c.map((x) => (x.value ?? x.text) || inline(x.children ?? [], title)).join('')",
    "  return c.map((x) => (x.text || x.value) || inline(x.children ?? [], title)).join('')",
    "  return c.map((x) => x.value || inline(x.children ?? [], title)).join('')",
  ]);
  assert.ok(lines(s).includes("  return c.map((x) => x.value || (inline(x.children ?? [], title) || x.text)).join('')"));
  assert.ok(lines(s).includes("  return c.map((x) => x.value || x.text || inline((x.children || []), title)).join('')"));
});

test("operands keep calls, optional chains, strings and negation whole", () => {
  assert.deepEqual(lines("const a = !f(x, y)?.z ?? 'a b'").slice(0, 2), ["const a = (!f(x, y)?.z || 'a b')", "const a = ('a b' ?? !f(x, y)?.z)"]);
});

test("?? [] and ?? {} → || is marked likely equivalent, since it differs only on '', 0 or false", () => {
  assert.deepEqual(mutantsOf("f(x.items ?? [], y ?? {}, z ?? 'n')").filter((m) => m.label.startsWith("`??`")).map((m) => [m.label, m.likely]), [
    ["`??` → `||` in `x.items ?? []`", true],
    ["`??` → `||` in `y ?? {}`", true],
    ["`??` → `||` in `z ?? 'n'`", false],
  ]);
});

test("a comparison's label names its operands, so two on one line differ", () => {
  assert.deepEqual(mutantsOf("a.type === 'h' ? b : c.level === 3").map((m) => m.label), ["`===` → `!==` in `a.type === 'h'`", "`===` → `!==` in `c.level === 3`"]);
});

test("assignments ||= and ??= are left alone", () => assert.deepEqual(lines("a ||= b; c ??= d"), []));

test("=== and !==, < and <=, > and >= swap; arrows and generics do not", () => {
  assert.deepEqual(lines("if (a === b && c !== d) return"), ["if (a !== b && c !== d) return", "if (a === b && c === d) return"]);
  const f = lines("const f = (n: Array<number>) => n.length < 3 || n[0] >= 1")
  assert.ok(f.includes("const f = (n: Array<number>) => n.length <= 3 || n[0] >= 1"))
  assert.ok(f.includes("const f = (n: Array<number>) => n.length < 3 || n[0] > 1"))
  assert.equal(f.filter((l) => l.includes("Array<number>") && !l.includes("=> ")).length, 0)
  assert.equal(f.filter((l) => !l.includes("Array<number>")).length, 0)
});

test("startsWith and endsWith become includes", () => assert.deepEqual(lines("k.startsWith('local-') && k.endsWith(pid)"), ["k.includes('local-') && k.endsWith(pid)", "k.startsWith('local-') && k.includes(pid)"]));

test("a predicate in filter, find, some or every becomes true, an arrow or a named function", () => {
  assert.deepEqual(lines("xs.filter((x) => x.id !== me).some(isBlank)").slice(-2), ["xs.filter((x) => true).some(isBlank)", "xs.filter((x) => x.id !== me).some(() => true)"]);
});

test("killers reads node tap, node spec and vitest failure names", () => {
  assert.deepEqual(killers("ok 1 - fine\nnot ok 2 - a text leaf reads its value\n"), ["a text leaf reads its value"]);
  assert.deepEqual(killers("✖ failing tests:\n\n✖ an empty value reads its text (1.2ms)\n"), ["an empty value reads its text"]);
  assert.deepEqual(killers(" × board > a done task strikes through 3ms\n"), ["board > a done task strikes through"]);
});

test("each mutant runs once, the file comes back after every run, and a survivor is reported", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mutate-"));
  const file = join(dir, "f.mjs");
  const body = "export const pick = (a, b) => a || b\n";
  writeFileSync(file, body);
  const seen = join(dir, "seen");
  writeFileSync(seen, "");
  const cmd = `cat ${file} >> ${seen}; node -e "import('${file}').then(m => process.exit(m.pick('', 'x') === 'x' ? 0 : 1))"`;
  const results = await mutate([{ where: `${file}:1` }], cmd);
  assert.equal(readFileSync(file, "utf8"), body);
  assert.deepEqual(results.map((r) => r.why), ["killed", "survived", "killed"]);
  assert.equal(readFileSync(seen, "utf8").split("\n").filter(Boolean).length, 3);
});

test("Ctrl-C mid-run stops the command and restores the file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mutate-"));
  const file = join(dir, "f.mjs");
  writeFileSync(file, "export const x = a === b\n");
  const runner = spawn(process.execPath, ["-e", `import('${new URL("./mutate.mjs", import.meta.url).pathname}').then((m) => m.mutate([{ where: '${file}:1' }], 'sleep 30'))`], { stdio: "ignore" });
  while (readFileSync(file, "utf8").includes("===")) await new Promise((r) => setTimeout(r, 20));
  runner.kill("SIGINT");
  const [code] = await once(runner, "exit");
  assert.equal(code, 130);
  assert.equal(readFileSync(file, "utf8"), "export const x = a === b\n");
});

test("a surviving ?? [] → || is reported as likely equivalent, the rest as survived", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mutate-"));
  const file = join(dir, "f.mjs");
  writeFileSync(file, "export const all = (a) => a ?? []\n");
  assert.deepEqual((await mutate([{ where: `${file}:1` }], "true")).map((r) => r.why), ["survived, likely equivalent", "survived", "survived"]);
});
