import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cleanup } from "./test-cleanup.mjs";

const HELPER = new URL("./test-cleanup.mjs", import.meta.url).href;
const PARENT = mkdtempSync(join(tmpdir(), "test-cleanup-"));
cleanup(() => rmSync(PARENT, { recursive: true, force: true }));

const script = (root) => `
  import { mkdirSync, rmSync } from "node:fs";
  import { test } from "node:test";
  import { cleanup } from ${JSON.stringify(HELPER)};
  mkdirSync(${JSON.stringify(root)});
  cleanup(() => rmSync(${JSON.stringify(root)}, { recursive: true, force: true }));
  test("hangs", () => new Promise(() => { console.log("ready"); setInterval(() => {}, 1000); }));
`;

const killedWith = (signal, root) =>
  new Promise((done, fail) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script(root)], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (out.includes("ready")) child.kill(signal);
    });
    child.on("error", fail);
    child.on("exit", (code) => done(code));
  });

for (const signal of ["SIGTERM", "SIGINT"]) {
  test(`a test file that gets ${signal} removes its temp root and exits 1`, { timeout: 30_000 }, async () => {
    const root = join(PARENT, signal);
    assert.equal(await killedWith(signal, root), 1);
    assert.equal(existsSync(root), false);
  });
}
