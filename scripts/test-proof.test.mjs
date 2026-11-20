import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ARGUMENTS, FOLDERS, LIMIT_PLANT, prove, readReports, reporterArgs } from "./test-proof.mjs";
import report, { REPORTER, reportDir } from "./test-report.mjs";

const OWN = fileURLToPath(new URL("own-tmp.mjs", import.meta.url));
const REPO = fileURLToPath(new URL("..", import.meta.url));
const ROOT = "/repo";
const DIR = "/runner/barkever-test-reports";
const scope = { jobs: { t: ["a/*.test.mjs"] }, skips: [] };
const files = ["a/x.test.mjs", "a/y.test.mjs"];
const pass = (file, name = "works") => ({ kind: "test", file, name, result: "pass" });
const record = (args = ["--test", "--test-timeout=300000", "a/*.test.mjs"], { pid = 41, nodeOptions = "", cwd = ROOT } = {}) => ({ kind: "run", argv: ["node", ...reporterArgs(REPORTER, DIR, pid), ...args], nodeOptions, cwd });
const green = (results = [pass("a/x.test.mjs"), pass("a/y.test.mjs")], run = record()) => ({ "41.run.jsonl": [run], "41.jsonl": results });
const proof = (reports, extra = {}) => prove({ job: "t", scope, inScope: files, reports, dirty: "", flags: "H a/x.test.mjs\nH a/y.test.mjs\n", reporter: REPORTER, dir: DIR, root: ROOT, ...extra });
const NO_REPORT = "no report in this run (no command ran it, or it crashed, timed out or was killed)";

function bare() {
  const { BARKEVER_TEST_REPORTING, NODE_TEST_CONTEXT, NODE_OPTIONS, RUNNER_TEMP, ...env } = process.env;
  return env;
}

function realRun(t, tree, runs) {
  const temp = mkdtempSync(join(tmpdir(), "proof-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(temp, path)), { recursive: true });
    writeFileSync(join(temp, path), text);
  }
  const env = bare();
  const runner = join(temp, "runner");
  for (const { cwd = "", args } of runs) spawnSync("node", args, { cwd: join(temp, cwd), env: { ...env, RUNNER_TEMP: runner }, encoding: "utf8", timeout: 30_000 });
  const dir = reportDir({ RUNNER_TEMP: runner });
  const inScope = Object.keys(tree).filter((path) => path.includes(".test.")).map((path) => relative(REPO, join(temp, path)));
  const at = (path) => relative(REPO, join(temp, path));
  return { temp, dir, at, problems: prove({ job: "t", scope, inScope, reports: readReports(dir), dirty: "", flags: "", reporter: REPORTER, dir, root: temp }) };
}

const own = (...args) => [OWN, "node", "--test", ...args];
const SUITES = 'import { describe, test } from "node:test";\ntest("works", () => {});\ndescribe("hidden group", { skip: true }, () => {\n  test("breaks", () => {\n    throw new Error("x");\n  });\n});\ndescribe.skip("skip group", () => {\n  test("inside", () => {});\n});\ndescribe.todo("todo group", () => {\n  test("later", () => {});\n});\n';

test("a full set of passing files is green", () => {
  assert.deepEqual(proof(green()), []);
});

test("a file in scope that no command ran is red by name", () => {
  assert.deepEqual(proof(green([pass("a/x.test.mjs")])), [`a/y.test.mjs: ${NO_REPORT}`]);
});

test("a failing test is red even when its exit code was hidden", () => {
  assert.deepEqual(proof(green([pass("a/x.test.mjs"), pass("a/y.test.mjs"), { kind: "test", file: "a/y.test.mjs", name: "breaks", result: "fail" }])), ["a/y.test.mjs: failed: breaks"]);
});

test("a file with no tests, or one that crashed before its tests, is red", () => {
  assert.deepEqual(proof(green([pass("a/x.test.mjs"), { kind: "file", file: "a/y.test.mjs", name: "a/y.test.mjs", result: "pass" }])), ["a/y.test.mjs: no test passed"]);
  assert.deepEqual(proof(green([pass("a/x.test.mjs"), { kind: "file", file: "a/y.test.mjs", name: "a/y.test.mjs", result: "fail" }])), ["a/y.test.mjs: failed: a/y.test.mjs", "a/y.test.mjs: no test passed"]);
});

test("the reporter knows the whole-file row by its shape, whatever node names it", async () => {
  const events = async function* () {
    for (const name of ["x.test.mjs", "zz/x.test.mjs", "src/lib/x.test.ts", "/abs/x.test.mjs"]) yield { type: "test:pass", data: { name, nesting: 0, line: 1, column: 1, file: join(REPO, "x.test.mjs"), details: { type: "test" } } };
    yield { type: "test:pass", data: { name: "real", nesting: 0, line: 2, column: 1, file: join(REPO, "x.test.mjs"), details: { type: "test" } } };
    yield { type: "test:pass", data: { name: "group", nesting: 0, line: 1, column: 1, file: join(REPO, "x.test.mjs"), skip: true, details: { type: "suite" } } };
  };
  const rows = [];
  for await (const line of report(events())) rows.push(JSON.parse(line));
  assert.deepEqual(rows.map(({ kind, name, result }) => [kind, name, result]), [["file", "x.test.mjs", "pass"], ["file", "zz/x.test.mjs", "pass"], ["file", "src/lib/x.test.ts", "pass"], ["file", "/abs/x.test.mjs", "pass"], ["test", "real", "pass"], ["test", "group", "skip"]]);
});

test("an empty or comment-only file is red by name, from the root and from app", (t) => {
  const { problems, at } = realRun(t, { "zz/empty.test.mjs": "", "zz/comment.test.mjs": "// nothing here\n", "app/src/zz/empty.test.ts": "" }, [
    { args: own("zz/empty.test.mjs", "zz/comment.test.mjs") },
    { cwd: "app", args: own("--experimental-strip-types", "src/zz/empty.test.ts") },
  ]);
  assert.deepEqual(problems, [`${at("zz/empty.test.mjs")}: no test passed`, `${at("zz/comment.test.mjs")}: no test passed`, `${at("app/src/zz/empty.test.ts")}: no test passed`]);
});

test("a skipped or todo describe is red unless pinned", (t) => {
  const { problems, at } = realRun(t, { "zz/suites.test.mjs": SUITES }, [{ args: own("zz/suites.test.mjs") }]);
  assert.deepEqual(problems, [`${at("zz/suites.test.mjs")}: skipped beyond the skip list: hidden group, skip group, later, todo group`]);
});

test("a skip or todo beyond the skip list is red", () => {
  assert.deepEqual(proof(green([pass("a/x.test.mjs"), pass("a/y.test.mjs"), { kind: "test", file: "a/x.test.mjs", name: "later", result: "skip" }])), ["a/x.test.mjs: skipped beyond the skip list: later"]);
  assert.deepEqual(proof(green([pass("a/x.test.mjs"), pass("a/y.test.mjs"), { kind: "test", file: "a/x.test.mjs", name: "later", result: "todo" }]), { scope: { ...scope, skips: [{ file: "a/x.test.mjs", name: "later" }] } }), []);
});

test("every report file pairs with exactly one run record that names it", (t) => {
  const results = [pass("a/x.test.mjs"), pass("a/y.test.mjs")];
  assert.deepEqual(proof({ ...green(), "9.jsonl": [pass("a/x.test.mjs")] }), ["9.jsonl: a report with no run record 9.run.jsonl"]);
  assert.deepEqual(proof({ "41.run.jsonl": [record()] }), ["job t: no test was reported", `a/x.test.mjs: ${NO_REPORT}`, `a/y.test.mjs: ${NO_REPORT}`, "41.run.jsonl: its run has no report file 41.jsonl"]);
  assert.deepEqual(proof({ "41.run.jsonl": [record(undefined, { pid: 7 })], "41.jsonl": results }), ["41.run.jsonl: node reporter arguments are not the ones own-tmp adds for 41.jsonl", ...reporterArgs(REPORTER, DIR, 7).map((arg) => `41.run.jsonl: node argument ${arg} is not on the list`)]);
  assert.deepEqual(proof({ "41.run.jsonl": [record(), record()], "41.jsonl": results }), ["41.run.jsonl: holds 2 lines, not one run record"]);
  assert.deepEqual(proof({ ...green(), "41.jsonl": [...results, record()] }), ["41.jsonl: holds a line that is not a test result"]);
  assert.deepEqual(proof({ ...green(), "notes.txt": [] }), ["notes.txt: not a file own-tmp writes, in the report folder"]);
  const bypass = 'import { test } from "node:test";\ntest("kept", () => {});\ntest("dropped and broken", () => {\n  throw new Error("x");\n});\n';
  const { problems, at, temp } = realRun(t, { "zz/a.test.mjs": 'import { test } from "node:test";\ntest("works", () => {});\n', "zz/b.test.mjs": bypass }, [{ args: own("zz/a.test.mjs") }]);
  assert.deepEqual(problems, [`${at("zz/b.test.mjs")}: ${NO_REPORT}`]);
  const dir = reportDir({ RUNNER_TEMP: join(temp, "runner") });
  spawnSync("node", ["--test", `--test-reporter=${REPORTER}`, `--test-reporter-destination=${join(dir, "9.jsonl")}`, "--test-name-pattern=kept", "zz/b.test.mjs"], { cwd: temp, env: bare(), encoding: "utf8", timeout: 30_000 });
  const again = prove({ job: "t", scope, inScope: [at("zz/a.test.mjs"), at("zz/b.test.mjs")], reports: readReports(dir), dirty: "", flags: "", reporter: REPORTER, dir, root: temp });
  assert.deepEqual(again, [`${at("zz/b.test.mjs")}: ${NO_REPORT}`, "9.jsonl: a report with no run record 9.run.jsonl"]);
});

test("the run's folder is the repo, app or mac, and --require is allowed in mac only", () => {
  const args = ["--require", "./test/fake/parent-watch.cjs", "--test", "a/*.test.mjs"];
  assert.deepEqual(proof(green(undefined, record(args, { cwd: `${ROOT}/mac` }))), []);
  assert.deepEqual(proof(green(undefined, record(args))), ["41.run.jsonl: node argument --require is not on the list", "41.run.jsonl: node argument ./test/fake/parent-watch.cjs is not on the list"]);
  assert.deepEqual(proof(green(undefined, record(undefined, { cwd: "/elsewhere" }))), ["41.run.jsonl: working folder /elsewhere is not the repo, app or mac"]);
  assert.deepEqual(proof(green(undefined, record(undefined, { cwd: "mac" }))), ["41.run.jsonl: working folder mac is not the repo, app or mac"]);
});

test("a name or skip pattern on a test process is red by the argument list", () => {
  assert.deepEqual(proof(green(undefined, record(["--test", "--test-name-pattern=works", "a/*.test.mjs"]))), ["41.run.jsonl: node argument --test-name-pattern=works is not on the list"]);
  assert.deepEqual(proof(green(undefined, record(["--test", "--test-skip-pattern", "slow", "a/*.test.mjs"]))), ["41.run.jsonl: node argument --test-skip-pattern is not on the list", "41.run.jsonl: node argument slow is not on the list"]);
});

test("NODE_OPTIONS off the list is red", () => {
  assert.deepEqual(proof(green(undefined, record(undefined, { nodeOptions: "--require ./quiet.cjs" }))), ["41.run.jsonl: NODE_OPTIONS argument --require ./quiet.cjs is not on the list"]);
  assert.deepEqual(proof(green(undefined, record(undefined, { nodeOptions: "--experimental-strip-types" }))), []);
});

test("reporter arguments other than own-tmp's are red", () => {
  const forged = { ...record(), argv: ["node", ...reporterArgs(REPORTER, "/elsewhere", 41), "--test", "a/*.test.mjs"] };
  assert.deepEqual(proof(green(undefined, forged)), ["41.run.jsonl: node reporter arguments are not the ones own-tmp adds for 41.jsonl", ...reporterArgs(REPORTER, "/elsewhere", 41).map((arg) => `41.run.jsonl: node argument ${arg} is not on the list`)]);
});

test("a tree that differs from the commit, or an index that hides edits, is red", () => {
  assert.deepEqual(proof(green(), { dirty: " M a/x.test.mjs\n" }), ["the tree differs from the commit: M a/x.test.mjs"]);
  assert.deepEqual(proof(green(), { flags: "h a/x.test.mjs\nS a/y.test.mjs\nH b.mjs\n" }), ["the index hides edits to a/x.test.mjs (git ls-files -v tag h)", "the index hides edits to a/y.test.mjs (git ls-files -v tag S)"]);
});

test("an empty scope or an empty report is red", () => {
  assert.deepEqual(proof({}, { inScope: [] }), ["job t: git ls-files finds no test file in its scope", "job t: no test process was recorded", "job t: no test was reported"]);
  assert.deepEqual(prove({ job: "nope", scope, inScope: [], reports: {}, dirty: "", flags: "", reporter: REPORTER, dir: DIR, root: ROOT }), ["job nope is not in test-scope.json"]);
});

test("a reported file outside the job's scope is red", () => {
  assert.deepEqual(proof(green([pass("a/x.test.mjs"), pass("a/y.test.mjs"), pass("b/z.test.mjs")])), ["b/z.test.mjs: reported, but not in job t's scope"]);
});

test("the allowed arguments and folders are written out, counted, and may only shrink", () => {
  assert.equal(ARGUMENTS.length, 5);
  assert.deepEqual(ARGUMENTS.map(({ arg, folder }) => (folder ? `${arg} (in ${folder})` : arg)), ["--test", "--test-timeout=<ms>", "--experimental-strip-types", "--require ./test/fake/parent-watch.cjs (in mac)", "<test path>"]);
  assert.equal(FOLDERS.length, 3);
  assert.deepEqual(FOLDERS, ["", "app", "mac"]);
});

test("the stated limit: a file that exits 0 after a flushed pass hides the tests after it", (t) => {
  const { problems, dir } = realRun(t, { "zz/exits.test.mjs": LIMIT_PLANT }, [{ args: own("zz/exits.test.mjs") }]);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.values(readReports(dir)).flat().filter((line) => line.kind === "test").map((line) => line.name), ["first"]);
});

test("own-tmp records a node --test run and its report, and node 22 leaves filtered tests out of the report", (t) => {
  const { dir, temp } = realRun(t, { "a.test.mjs": 'import { test } from "node:test";\ntest("kept", () => {});\ntest("dropped", () => {});\ntest("later", { skip: true }, () => {});\n', "b.test.mjs": "" }, [{ args: own("--test-name-pattern=kept|later", "a.test.mjs", "b.test.mjs") }]);
  const reports = readReports(dir);
  const [runName] = Object.keys(reports).filter((name) => name.endsWith(".run.jsonl"));
  const pid = Number(runName.split(".")[0]);
  assert.deepEqual(Object.keys(reports).sort(), [`${pid}.jsonl`, runName]);
  assert.deepEqual(reports[runName].map(({ argv, cwd }) => [argv, cwd]), [[["node", ...reporterArgs(REPORTER, dir, pid), "--test", "--test-name-pattern=kept|later", "a.test.mjs", "b.test.mjs"], temp]]);
  assert.deepEqual(reports[`${pid}.jsonl`].map(({ kind, file, name, result }) => [kind, file.split("/").pop(), name, result]).sort(), [["file", "b.test.mjs", "b.test.mjs", "pass"], ["test", "a.test.mjs", "kept", "pass"], ["test", "a.test.mjs", "later", "skip"]]);
  const local = mkdtempSync(join(temp, "local-"));
  const outside = bare();
  assert.equal(spawnSync("node", own("a.test.mjs"), { cwd: temp, env: { ...outside, TMPDIR: `${local}/` }, encoding: "utf8", timeout: 30_000 }).status, 0);
  assert.equal(reportDir(outside), null);
  assert.deepEqual(readdirSync(local), []);
});
