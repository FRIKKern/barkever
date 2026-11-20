import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ARGUMENTS, prove, reporterArgs } from "./test-proof.mjs";
import { REPORTER } from "./test-report.mjs";

const OWN = fileURLToPath(new URL("own-tmp.mjs", import.meta.url));
const DIR = "/runner/barkever-test-reports";
const scope = { jobs: { t: ["a/*.test.mjs"] }, skips: [] };
const files = ["a/x.test.mjs", "a/y.test.mjs"];
const pass = (file, name = "works") => ({ kind: "test", file, name, result: "pass" });
const run = (args = ["--test", "--test-timeout=300000", "a/*.test.mjs"], nodeOptions = "") => ({ kind: "run", argv: ["node", ...reporterArgs(REPORTER, DIR, 41), ...args], nodeOptions, cwd: "/repo" });
const green = () => [run(), pass("a/x.test.mjs"), pass("a/y.test.mjs")];
const proof = (lines, extra = {}) => prove({ job: "t", scope, inScope: files, lines, dirty: "", reporter: REPORTER, dir: DIR, ...extra });

test("a full set of passing files is green", () => {
  assert.deepEqual(proof(green()), []);
});

test("a file in scope that no command ran is red by name", () => {
  assert.deepEqual(proof([run(), pass("a/x.test.mjs")]), ["a/y.test.mjs: no report in this run (no command ran it, or it crashed, timed out or was killed)"]);
});

test("a failing test is red even when its exit code was hidden", () => {
  assert.deepEqual(proof([...green(), { kind: "test", file: "a/y.test.mjs", name: "breaks", result: "fail" }]), ["a/y.test.mjs: failed: breaks"]);
});

test("a file with no tests is red", () => {
  assert.deepEqual(proof([run(), pass("a/x.test.mjs"), { kind: "file", file: "a/y.test.mjs", name: "y.test.mjs", result: "pass" }]), ["a/y.test.mjs: no test passed"]);
});

test("a file that crashed before its tests is red", () => {
  assert.deepEqual(proof([run(), pass("a/x.test.mjs"), { kind: "file", file: "a/y.test.mjs", name: "y.test.mjs", result: "fail" }]), ["a/y.test.mjs: failed: y.test.mjs", "a/y.test.mjs: no test passed"]);
});

test("a skip or todo beyond the skip list is red", () => {
  assert.deepEqual(proof([...green(), { kind: "test", file: "a/x.test.mjs", name: "later", result: "skip" }]), ["a/x.test.mjs: skipped beyond the skip list: later"]);
  assert.deepEqual(proof([...green(), { kind: "test", file: "a/x.test.mjs", name: "later", result: "todo" }], { scope: { ...scope, skips: [{ file: "a/x.test.mjs", name: "later" }] } }), []);
});

test("a name or skip pattern on a test process is red by the argument list", () => {
  const [, ...rest] = green();
  assert.deepEqual(proof([run(["--test", "--test-name-pattern=works", "a/*.test.mjs"]), ...rest]), ["node argument --test-name-pattern=works is not on the list"]);
  assert.deepEqual(proof([run(["--test", "--test-skip-pattern", "slow", "a/*.test.mjs"]), ...rest]), ["node argument --test-skip-pattern is not on the list", "node argument slow is not on the list"]);
});

test("NODE_OPTIONS off the list is red", () => {
  const [, ...rest] = green();
  assert.deepEqual(proof([run(undefined, "--require ./quiet.cjs"), ...rest]), ["NODE_OPTIONS argument --require ./quiet.cjs is not on the list"]);
  assert.deepEqual(proof([run(undefined, "--experimental-strip-types"), ...rest]), []);
});

test("reporter arguments other than own-tmp's are red", () => {
  const [, ...rest] = green();
  const forged = { ...run(), argv: ["node", ...reporterArgs(REPORTER, "/elsewhere", 41), "--test", "a/*.test.mjs"] };
  assert.deepEqual(proof([forged, ...rest]), ["node reporter arguments are not the ones own-tmp adds", ...reporterArgs(REPORTER, "/elsewhere", 41).map((arg) => `node argument ${arg} is not on the list`)]);
});

test("a tree that differs from the commit is red", () => {
  assert.deepEqual(proof(green(), { dirty: " M a/x.test.mjs\n" }), ["the tree differs from the commit: M a/x.test.mjs"]);
});

test("an empty scope or an empty report is red", () => {
  assert.deepEqual(proof([], { inScope: [] }), ["job t: git ls-files finds no test file in its scope", "job t: no test process was recorded", "job t: no test was reported"]);
  assert.deepEqual(prove({ job: "nope", scope, inScope: [], lines: [], dirty: "", reporter: REPORTER, dir: DIR }), ["job nope is not in test-scope.json"]);
});

test("a reported file outside the job's scope is red", () => {
  assert.deepEqual(proof([...green(), pass("b/z.test.mjs")]), ["b/z.test.mjs: reported, but not in job t's scope"]);
});

test("the argument list is written out and short", () => {
  assert.deepEqual(ARGUMENTS, ["--test", "--test-timeout=<ms>", "--experimental-strip-types", "--require ./test/fake/parent-watch.cjs", "<test path>"]);
});

test("own-tmp records a node --test run and its report, and node 22 leaves filtered tests out of the report", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "proof-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  writeFileSync(join(temp, "a.test.mjs"), 'import { test } from "node:test";\ntest("kept", () => {});\ntest("dropped", () => {});\ntest("later", { skip: true }, () => {});\n');
  writeFileSync(join(temp, "b.test.mjs"), "");
  const { BARKEVER_TEST_REPORTING, NODE_TEST_CONTEXT, ...env } = process.env;
  const done = spawnSync("node", [OWN, "node", "--test", "--test-name-pattern=kept|later", "a.test.mjs", "b.test.mjs"], { cwd: temp, env: { ...env, RUNNER_TEMP: temp }, encoding: "utf8", timeout: 30_000 });
  assert.equal(done.status, 0, done.stderr);
  const dir = join(temp, "barkever-test-reports");
  const lines = readdirSync(dir).flatMap((name) => readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)));
  const [record] = lines.filter((line) => line.kind === "run");
  assert.deepEqual(record.argv, ["node", ...reporterArgs(REPORTER, dir, Number(/(\d+)\.jsonl$/.exec(record.argv[4])[1])), "--test", "--test-name-pattern=kept|later", "a.test.mjs", "b.test.mjs"]);
  const results = lines.filter((line) => line.kind !== "run").map(({ kind, file, name, result }) => [kind, file.split("/").pop(), name, result]);
  assert.deepEqual(results.sort(), [["file", "b.test.mjs", "b.test.mjs", "pass"], ["test", "a.test.mjs", "kept", "pass"], ["test", "a.test.mjs", "later", "skip"]]);
});
