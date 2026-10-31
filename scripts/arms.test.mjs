import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ARMS = new URL("./arms.mjs", import.meta.url).pathname;

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "arms-"));
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir });
  git("init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.mjs"), "export const x = 1\n");
  writeFileSync(join(dir, "a.test.mjs"), "export const y = 1\n");
  git("add", ".");
  git("commit", "-qm", "base");
  git("checkout", "-qb", "work");
  writeFileSync(join(dir, "a.mjs"), "export const pick = (a, b) => a || b\nexport const all = (a) => a ?? []\n");
  writeFileSync(join(dir, "a.test.mjs"), "export const y = (a) => a || 2\n");
  git("commit", "-qam", "work");
  return dir;
}

const arms = (dir, ...args) => spawnSync(process.execPath, [ARMS, ...args], { cwd: dir, encoding: "utf8" });
const KILLS = `node -e "import('./a.mjs').then(({pick, all}) => process.exit(pick('', 'x') === 'x' && pick('y', 'x') === 'y' && Array.isArray(all(null)) && all([1])[0] === 1 ? 0 : 1))"`;

test("without --run it lists the arms of the diff from main, test files left out", () => {
  const r = arms(repo());
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\| a\.mjs:1 \| fallback \|/);
  assert.match(r.stdout, /\| a\.mjs:2 \| fallback \|/);
  assert.doesNotMatch(r.stdout, /a\.test\.mjs/);
});

test("--run with no command is a usage error, first or last", () => {
  assert.equal(arms(repo(), "main", "--run").status, 2);
  assert.equal(arms(repo(), "--run").status, 2);
});

test("a --timeout that is not a whole number of ms above 0 is a usage error naming --timeout, before the command runs", () => {
  for (const bad of [["--timeout", "abc"], ["--timeout"], ["--timeout", "0"], ["--timeout", "-5"], ["--timeout", "1.5"]]) {
    const dir = repo();
    const r = arms(dir, "main", "--run", "touch ran", ...bad);
    assert.equal(r.status, 2, bad.join(" "));
    assert.match(r.stderr, /--timeout/, bad.join(" "));
    assert.match(r.stderr, /^usage:/m, bad.join(" "));
    assert.doesNotMatch(r.stderr, /clean tree/, bad.join(" "));
    assert.equal(existsSync(join(dir, "ran")), false, bad.join(" "));
  }
  const r = arms(repo(), "main", "--timeout", "--run", "exit 0");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--timeout/);
});

test("a base other than main is read from the first plain argument, and Go rows are listed but not mutated", () => {
  const dir = repo();
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir });
  git("branch", "trunk", "work");
  writeFileSync(join(dir, "b.go"), "package b\nfunc f(a, b bool) bool { if a || b { return true }; return false }\n");
  writeFileSync(join(dir, "c.mjs"), "export const z = (a) => a || 3\n");
  git("add", ".");
  git("commit", "-qm", "more");
  const listed = arms(dir, "trunk");
  assert.match(listed.stdout, /b\.go:2/);
  assert.doesNotMatch(listed.stdout, /a\.mjs/);
  const r = arms(dir, "trunk", "--run", "true");
  assert.match(r.stdout, /No operator mutant: each of these needs a hand mutant\.\n\n- b\.go:2 \(fallback\)/);
  assert.match(r.stdout, /mutants: 3 run, 0 killed, 3 survived, 0 likely equivalent, 0 do not parse; 1 of 2 arm rows have no operator mutant/);
});

test("only likely-equivalent survivors pass, and --strict fails them", () => {
  const dir = repo();
  const r = arms(dir, "--run", KILLS, "main");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Likely equivalent:[\s\S]*\| a\.mjs:2 \| `\?\?` → `\\\|\\\|` in `a \?\? \[\]` \| survived \|/);
  assert.match(r.stdout, /mutants: 6 run, 5 killed, 0 survived, 1 likely equivalent, 0 do not parse; 0 of 2 arm rows have no operator mutant/);
  const strict = arms(dir, "main", "--run", KILLS, "--strict");
  assert.equal(strict.status, 1);
  assert.match(strict.stdout, /mutants: 6 run, 5 killed, 1 survived, 0 do not parse; 0 of 2/);
});

test("a real survivor fails the run and shows in the main table", () => {
  const r = arms(repo(), "main", "--run", "true");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^\| a\.mjs:1 \| fallback \|/m);
  assert.match(r.stdout, /\| a\.mjs:1 \| swap `a \\\|\\\| b` \| survived \|/);
  assert.match(r.stdout, /mutants: 6 run, 0 killed, 5 survived, 1 likely equivalent/);
});

test("it refuses to mutate a file with uncommitted changes", () => {
  const dir = repo();
  writeFileSync(join(dir, "a.mjs"), "export const pick = (a, b) => a || b\nexport const all = (a) => a ?? []\n// edited\n");
  const r = arms(dir, "main", "--run", "true");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /commit first/);
});

test("a command that fails on the clean tree stops the run before any mutant, and writes nothing", () => {
  for (const cmd of ["false", "nosuchcmd-xyz", "exit 3", "node --test nosuch.test.mjs", `node -e "process.exit(1)"`]) {
    const dir = repo();
    const r = arms(dir, "main", "--run", cmd);
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /fails on the clean tree/, cmd);
    assert.doesNotMatch(r.stdout, /^mutants:/m, cmd);
    assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }), "", cmd);
  }
});

test("a mutant that hangs the tests counts as killed once --timeout passes", () => {
  const dir = repo();
  const git = (...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir });
  writeFileSync(join(dir, "t.mjs"), "export const t = (a) => (a === 1 ? 1 : 0)\n");
  git("add", ".");
  git("commit", "-qm", "t");
  const t0 = Date.now();
  const r = arms(dir, "--timeout", "500", "HEAD~1", "--run", "grep -q '!==' t.mjs && sleep 30.7; exit 0");
  assert.ok(Date.now() - t0 < 10_000, `${Date.now() - t0} ms`);
  assert.match(r.stdout, /\| t\.mjs:1 \| `===` → `!==` in `a === 1` \| killed \(timeout\) \|/);
  assert.match(r.stdout, /mutants: 1 run, 1 killed, 0 survived/);
  assert.equal(r.status, 0);
});
