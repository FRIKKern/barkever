import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { LIMIT, PROOF, prove, readReports, scopeFiles } from "./test-proof.mjs";
import { REPORTER, reportDir } from "./test-report.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const TEST_FILE = /\.test\.[a-z]+$/;

export const WORKFLOW_KEYS = ["name", "on", "permissions", "concurrency", "defaults", "env", "jobs"];
export const DEFAULTS = { run: { shell: "bash" } };
export const ENV_KEYS = ["ELECTRON_SKIP_BINARY_DOWNLOAD"];
export const JOB_KEYS = ["runs-on", "timeout-minutes", "env", "steps"];
export const STEP_KEYS = ["name", "uses", "with", "run", "shell"];

const off = (object, list) => Object.keys(object ?? {}).filter((key) => !list.includes(key));

export function proofProblems(workflow, scope) {
  const top = [
    ...off(workflow, WORKFLOW_KEYS).map((key) => `workflow key ${key} is not on the list`),
    ...("defaults" in workflow && JSON.stringify(workflow.defaults) !== JSON.stringify(DEFAULTS) ? [`workflow defaults are not exactly ${JSON.stringify(DEFAULTS)}`] : []),
    ...off(workflow.env, ENV_KEYS).map((key) => `workflow env ${key} is not on the list`),
  ];
  return [...top, ...Object.keys(scope.jobs).flatMap((name) => {
    const job = workflow.jobs?.[name];
    if (!job) return [`${name}: in test-scope.json but not a ci job`];
    const steps = job.steps ?? [];
    return [
      ...off(job, JOB_KEYS).map((key) => `${name}: job key ${key} is not on the list`),
      ...off(job.env, ENV_KEYS).map((key) => `${name}: env ${key} is not on the list`),
      ...[...new Set(steps.flatMap((step) => off(step, STEP_KEYS)))].map((key) => `${name}: step key ${key} is not on the list`),
      ...steps.filter((step) => "shell" in step && step.shell !== "bash").map((step) => `${name}: step shell ${step.shell} is not bash`),
      ...(JSON.stringify(steps.at(-1)) === JSON.stringify(PROOF) ? [] : [`${name}: the last step is not exactly ${JSON.stringify(PROOF)}`]),
      ...steps.slice(0, -1).filter((step) => step.run === PROOF.run).map(() => `${name}: the proof runs before the last step`),
    ];
  })];
}

export function scopeProblems(tracked, scope, filesOf) {
  const tests = tracked.filter((file) => TEST_FILE.test(file));
  const seen = Object.entries(scope.jobs).flatMap(([job, globs]) => filesOf(globs).map((file) => [file, job]));
  const jobsOf = Map.groupBy(seen, ([file]) => file);
  return [
    ...tests.filter((file) => !jobsOf.has(file) && !scope.notInCi[file]).map((file) => `${file}: in no job's scope in test-scope.json`),
    ...[...jobsOf].filter(([, rows]) => rows.length > 1).map(([file, rows]) => `${file}: in more than one scope: ${rows.map(([, job]) => job).join(", ")}`),
    ...Object.keys(scope.notInCi).filter((file) => !tests.includes(file) || jobsOf.has(file)).map((file) => `${file}: in notInCi but ci runs it or it is gone`),
  ];
}

const scope = JSON.parse(read("scripts/test-scope.json"));
const workflow = load(read(".github/workflows/ci.yml"));
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

test("every job in test-scope.json ends with the test proof, and nothing can skip it", () => {
  assert.deepEqual(proofProblems(workflow, scope), []);
  const job = (patch) => ({ ...workflow, jobs: { ...workflow.jobs, "test-app": { ...workflow.jobs["test-app"], ...patch } } });
  const steps = workflow.jobs["test-app"].steps;
  assert.deepEqual(proofProblems(job({ if: "false" }), scope), ["test-app: job key if is not on the list"]);
  assert.deepEqual(proofProblems(job({ "continue-on-error": true }), scope), ["test-app: job key continue-on-error is not on the list"]);
  assert.deepEqual(proofProblems(job({ steps: [...steps.slice(0, -1), { ...PROOF, if: "always()" }] }), scope), ["test-app: step key if is not on the list", `test-app: the last step is not exactly ${JSON.stringify(PROOF)}`]);
  assert.deepEqual(proofProblems(job({ steps: [...steps.slice(0, -1), { ...PROOF, run: `${PROOF.run} || true` }] }), scope), [`test-app: the last step is not exactly ${JSON.stringify(PROOF)}`]);
  assert.deepEqual(proofProblems(job({ steps: [...steps, { run: "echo later" }] }), scope), [`test-app: the last step is not exactly ${JSON.stringify(PROOF)}`, "test-app: the proof runs before the last step"]);
  assert.deepEqual(proofProblems({ ...workflow, jobs: { ...workflow.jobs, "test-mac": undefined } }, scope), ["test-mac: in test-scope.json but not a ci job"]);
});

test("no workflow or job key can turn the proof into a no-op", () => {
  const job = (patch) => ({ ...workflow, jobs: { ...workflow.jobs, gate: { "runs-on": "ubuntu-latest", if: "false", steps: [{ run: "true" }] }, "test-app": { ...workflow.jobs["test-app"], ...patch } } });
  assert.deepEqual(proofProblems({ ...workflow, defaults: { run: { shell: "true {0}" } } }, scope), [`workflow defaults are not exactly ${JSON.stringify(DEFAULTS)}`]);
  assert.deepEqual(proofProblems(job({ defaults: { run: { shell: "true {0}" } } }), scope), ["test-app: job key defaults is not on the list"]);
  assert.deepEqual(proofProblems(job({ defaults: { run: { "working-directory": "app" } } }), scope), ["test-app: job key defaults is not on the list"]);
  assert.deepEqual(proofProblems(job({ needs: "gate" }), scope), ["test-app: job key needs is not on the list"]);
  assert.deepEqual(proofProblems(job({ env: { NODE_OPTIONS: "--import ./forge.mjs" } }), scope), ["test-app: env NODE_OPTIONS is not on the list"]);
  assert.deepEqual(proofProblems({ ...workflow, env: { ...workflow.env, NODE_OPTIONS: "--import ./forge.mjs" } }, scope), ["workflow env NODE_OPTIONS is not on the list"]);
  assert.deepEqual(proofProblems(job({ steps: [{ run: "pnpm test", shell: "true {0}" }, ...workflow.jobs["test-app"].steps] }), scope), ["test-app: step shell true {0} is not bash"]);
  assert.deepEqual(proofProblems(job({ steps: [{ run: "pnpm test", "working-directory": "app" }, ...workflow.jobs["test-app"].steps] }), scope), ["test-app: step key working-directory is not on the list"]);
  assert.deepEqual(proofProblems({ ...workflow, "run-name": "x" }, scope), ["workflow key run-name is not on the list"]);
});

test("the key lists are written out, counted, and may only shrink", () => {
  assert.deepEqual([WORKFLOW_KEYS.length, ENV_KEYS.length, JOB_KEYS.length, STEP_KEYS.length], [7, 1, 4, 5]);
  assert.deepEqual(WORKFLOW_KEYS, ["name", "on", "permissions", "concurrency", "defaults", "env", "jobs"]);
  assert.deepEqual(DEFAULTS, { run: { shell: "bash" } });
  assert.deepEqual(ENV_KEYS, ["ELECTRON_SKIP_BINARY_DOWNLOAD"]);
  assert.deepEqual(JOB_KEYS, ["runs-on", "timeout-minutes", "env", "steps"]);
  assert.deepEqual(STEP_KEYS, ["name", "uses", "with", "run", "shell"]);
});

test("the scopes hold every tracked test file once, but those listed as not in ci", () => {
  assert.deepEqual(scopeProblems(tracked, scope, scopeFiles), []);
  assert.deepEqual(scopeProblems([...tracked, "tools/planted.test.mjs"], scope, scopeFiles), ["tools/planted.test.mjs: in no job's scope in test-scope.json"]);
  assert.deepEqual(scopeProblems(tracked, { ...scope, jobs: { ...scope.jobs, again: ["scripts/pack.test.mjs"] } }, scopeFiles), ["scripts/pack.test.mjs: in more than one scope: test-scripts, again"]);
  assert.deepEqual(scopeProblems(tracked.filter((file) => !file.startsWith("app/e2e/j10/")), scope, scopeFiles), ["app/e2e/j10/j10.test.ts: in notInCi but ci runs it or it is gone"]);
});

test("the skip list is pinned by count and may only shrink", () => {
  assert.equal(scope.skips.length, 0);
});

test("the check states what it cannot catch", () => {
  assert.equal(LIMIT, "tracked code can forge the report; a test file that ends its own process early with exit 0 belongs to this limit");
});

export const KNOWN_LIMITS = {
  L1: "a later direct run of the reporter that rewrites a report own-tmp made",
  L2: "run text that writes GITHUB_ENV, GITHUB_PATH or BASH_ENV, or a node earlier on PATH",
  L3: "any uses: step or with: value",
  L4: "an on: cut to workflow_dispatch only, which shows as missing checks rather than a pass",
  L5: "a real test call at line 1, column 1 is read as the file row, a known false red",
};

function bare() {
  const { BARKEVER_TEST_REPORTING, NODE_TEST_CONTEXT, NODE_OPTIONS, RUNNER_TEMP, GITHUB_JOB, BASH_ENV, ...env } = process.env;
  return env;
}

function folder(t, tree) {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), "limit-")));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  for (const [path, text] of Object.entries(tree)) {
    mkdirSync(dirname(join(temp, path)), { recursive: true });
    writeFileSync(join(temp, path), text);
  }
  const dir = reportDir({ RUNNER_TEMP: join(temp, "runner") });
  const at = (path) => relative(realpathSync(root), join(temp, path));
  const proof = (files) => prove({ job: "t", scope: { jobs: { t: ["x"] }, skips: [] }, inScope: files.map(at), reports: readReports(dir), dirty: "", flags: "", reporter: REPORTER, dir, root: temp });
  const own = (...args) => spawnSync("node", [fileURLToPath(new URL("own-tmp.mjs", import.meta.url)), "node", "--test", ...args], { cwd: temp, env: { ...bare(), RUNNER_TEMP: join(temp, "runner") }, encoding: "utf8", timeout: 30_000 });
  return { temp, dir, at, proof, own };
}

const proofExit = (env, shell = "node scripts/test-proof.mjs") => spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", shell], { cwd: root, env: { ...bare(), ...env }, encoding: "utf8", timeout: 30_000 }).status;

export const PLANTS = {
  L1: (t) => {
    const { temp, dir, proof, own } = folder(t, { "zz/b.test.mjs": 'import { test } from "node:test";\ntest("kept", () => {});\ntest("dropped and broken", () => {\n  throw new Error("x");\n});\n' });
    own("zz/b.test.mjs");
    assert.notDeepEqual(proof(["zz/b.test.mjs"]), []);
    const [report] = Object.keys(readReports(dir)).filter((name) => /^\d+\.jsonl$/.test(name));
    spawnSync("node", ["--test", `--test-reporter=${REPORTER}`, `--test-reporter-destination=${join(dir, report)}`, "--test-name-pattern=kept", "zz/b.test.mjs"], { cwd: temp, env: bare(), encoding: "utf8", timeout: 30_000 });
    assert.deepEqual(proof(["zz/b.test.mjs"]), []);
  },
  L2: (t) => {
    const { temp } = folder(t, { "bash-env": "exit 0\n", "bin/node": "#!/bin/sh\nexit 0\n" });
    chmodSync(join(temp, "bin/node"), 0o755);
    assert.equal(proofExit({}), 1);
    assert.equal(proofExit({ NODE_OPTIONS: "--import=data:text/javascript,process.exit(0)" }), 0);
    assert.equal(proofExit({ BASH_ENV: join(temp, "bash-env") }), 0);
    assert.equal(proofExit({ PATH: `${join(temp, "bin")}:${process.env.PATH}` }), 0);
  },
  L3: () => {
    const steps = workflow.jobs["test-app"].steps.map((step) => (step.uses?.startsWith("actions/setup-node@") ? { ...step, with: { ...step.with, "node-version": 18 } } : step.uses?.startsWith("actions/checkout@") ? { uses: "someone/else@v1" } : step));
    assert.deepEqual(proofProblems({ ...workflow, jobs: { ...workflow.jobs, "test-app": { ...workflow.jobs["test-app"], steps } } }, scope), []);
  },
  L4: () => {
    assert.deepEqual(proofProblems({ ...workflow, on: { workflow_dispatch: {} } }, scope), []);
  },
  L5: (t) => {
    const { at, proof, own } = folder(t, { "zz/first.test.mjs": 'test("on the first line", () => {});\nimport { test } from "node:test";\n' });
    assert.equal(own("zz/first.test.mjs").status, 0);
    assert.deepEqual(proof(["zz/first.test.mjs"]), [`${at("zz/first.test.mjs")}: no test passed`]);
  },
};

test("every known limit has a plant that runs, and every plant a limit", () => {
  assert.deepEqual(Object.keys(KNOWN_LIMITS), ["L1", "L2", "L3", "L4", "L5"]);
  assert.deepEqual(Object.keys(PLANTS), Object.keys(KNOWN_LIMITS));
});

for (const [id, plant] of Object.entries(PLANTS)) test(`known limit ${id}: ${KNOWN_LIMITS[id]}`, plant);
