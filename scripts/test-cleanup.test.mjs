import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import { cleanup } from "./test-cleanup.mjs";

const HELPER = new URL("./test-cleanup.mjs", import.meta.url).href;
const PARENT = mkdtempSync(join(tmpdir(), "test-cleanup-"));
cleanup([PARENT]);

const roots = (name) => [join(PARENT, name), join(PARENT, `${name}-second`)];
const alsoRan = (name) => join(PARENT, `${name}-also-ran`);
const withRoots = (name, body) => `
  import { spawnSync } from "node:child_process";
  import { mkdirSync, writeFileSync } from "node:fs";
  import { test } from "node:test";
  import { cleanup } from ${JSON.stringify(HELPER)};
  const roots = ${JSON.stringify(roots(name))};
  for (const root of roots) { mkdirSync(root); writeFileSync(root + "/file", ""); }
  cleanup(roots, () => writeFileSync(${JSON.stringify(alsoRan(name))}, ""));
  const parent = process.ppid;
  setInterval(() => process.ppid !== parent && process.exit(), 500).unref();
  ${body}
`;
const passes = `test("passes", () => {});`;
const hangs = `test("hangs", () => new Promise(() => { console.log("ready"); setInterval(() => {}, 1000); }));`;
const UNTIL_ORPHANED = `const parent = process.ppid; setInterval(() => process.ppid !== parent && process.exit(), 50); setTimeout(() => process.exit(), 20000);`;
const stuckInSpawnSync = (returned) => `test("stuck", () => {
  spawnSync(process.execPath, ["-e", ${JSON.stringify(UNTIL_ORPHANED)}]);
  writeFileSync(${JSON.stringify(returned)}, "");
});`;

const gone = async (paths) => {
  for (let i = 0; i < 300 && paths.some(existsSync); i++) await wait(100);
  return paths.filter(existsSync);
};
const ended = (child) =>
  new Promise((done, fail) => {
    const giveUp = setTimeout(() => child.kill("SIGKILL"), 45_000);
    child.on("error", fail);
    child.on("exit", (code, signal) => { clearTimeout(giveUp); done(code ?? signal); });
  });
const file = (name, body) => spawn(process.execPath, ["--input-type=module", "-e", withRoots(name, body)], { stdio: ["ignore", "pipe", "inherit"], detached: true });
const groupKilledWith = (signal, name) => {
  const child = file(name, hangs);
  let out = "";
  child.stdout.on("data", (d) => {
    out += d;
    if (out.includes("ready")) process.kill(-child.pid, signal);
  });
  return ended(child);
};

test("a test file that ends by itself runs its own clear and removes every root, files and all", { timeout: 60_000 }, async () => {
  assert.equal(await ended(file("passes", passes)), 0);
  assert.equal(existsSync(alsoRan("passes")), true);
  assert.deepEqual(roots("passes").filter(existsSync), []);
});

for (const signal of ["SIGINT", "SIGHUP", "SIGQUIT"]) {
  test(`a test file that gets ${signal} runs its own clear, removes every root and exits 1`, { timeout: 60_000 }, async () => {
    assert.equal(await groupKilledWith(signal, signal), 1);
    assert.equal(existsSync(alsoRan(signal)), true);
    assert.deepEqual(roots(signal).filter(existsSync), []);
  });
}

for (const signal of ["SIGTERM", "SIGKILL"]) {
  test(`a test file whose whole group gets ${signal} dies of it at once, and every root is removed after`, { timeout: 60_000 }, async () => {
    assert.equal(await groupKilledWith(signal, signal), signal);
    assert.deepEqual(await gone(roots(signal)), []);
  });
}

test("a test stuck in spawnSync is ended by --test-timeout while it is still stuck, and every root is removed", { timeout: 120_000 }, async () => {
  const returned = join(PARENT, "returned");
  const stuck = join(PARENT, "stuck.test.mjs");
  writeFileSync(stuck, withRoots("stuck", stuckInSpawnSync(returned)));
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  assert.equal(await ended(spawn(process.execPath, ["--test", "--test-timeout=1000", stuck], { stdio: "ignore", env })), 1);
  assert.equal(existsSync(returned), false, "the test got past spawnSync, so the timeout did not end it while it was stuck");
  assert.deepEqual(await gone(roots("stuck")), []);
});
