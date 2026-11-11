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

const withRoot = (root, body) => `
  import { spawnSync } from "node:child_process";
  import { mkdirSync, writeFileSync } from "node:fs";
  import { test } from "node:test";
  import { cleanup } from ${JSON.stringify(HELPER)};
  mkdirSync(${JSON.stringify(root)});
  cleanup([${JSON.stringify(root)}]);
  ${body}
`;
const hangs = `test("hangs", () => new Promise(() => { console.log("ready"); setInterval(() => {}, 1000); }));`;
const UNTIL_ORPHANED = `const parent = process.ppid; setInterval(() => process.ppid !== parent && process.exit(), 50); setTimeout(() => process.exit(), 20000);`;
const stuckInSpawnSync = (returned) => `test("stuck", () => {
  spawnSync(process.execPath, ["-e", ${JSON.stringify(UNTIL_ORPHANED)}]);
  writeFileSync(${JSON.stringify(returned)}, "");
});`;

const gone = async (path) => {
  for (let i = 0; i < 300 && existsSync(path); i++) await wait(100);
  return !existsSync(path);
};
const killedWith = (signal, root) =>
  new Promise((done, fail) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", withRoot(root, hangs)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (out.includes("ready")) child.kill(signal);
    });
    child.on("error", fail);
    child.on("exit", (code, by) => done(code ?? by));
  });

for (const signal of ["SIGINT", "SIGHUP", "SIGQUIT"]) {
  test(`a test file that gets ${signal} removes its temp root and exits 1`, { timeout: 60_000 }, async () => {
    const root = join(PARENT, signal);
    assert.equal(await killedWith(signal, root), 1);
    assert.equal(existsSync(root), false);
  });
}

for (const signal of ["SIGTERM", "SIGKILL"]) {
  test(`a test file that gets ${signal} dies of it at once, and its temp root is removed after`, { timeout: 60_000 }, async () => {
    const root = join(PARENT, signal);
    assert.equal(await killedWith(signal, root), signal);
    assert.equal(await gone(root), true);
  });
}

test("a test stuck in spawnSync is ended by --test-timeout while it is still stuck, and its temp root is removed", { timeout: 120_000 }, async () => {
  const root = join(PARENT, "stuck");
  const returned = join(PARENT, "returned");
  const file = join(PARENT, "stuck.test.mjs");
  writeFileSync(file, withRoot(root, stuckInSpawnSync(returned)));
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const runner = spawn(process.execPath, ["--test", "--test-timeout=1000", file], { stdio: "ignore", env });
  const code = await new Promise((done, fail) => { runner.on("error", fail); runner.on("exit", done); });
  assert.equal(code, 1);
  assert.equal(existsSync(returned), false, "the test got past spawnSync, so the timeout did not end it while it was stuck");
  assert.equal(await gone(root), true);
});
