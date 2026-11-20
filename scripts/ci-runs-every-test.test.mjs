import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { LIMIT, PROOF, scopeFiles } from "./test-proof.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const TEST_FILE = /\.test\.[a-z]+$/;

export function proofProblems(workflow, scope) {
  return Object.keys(scope.jobs).flatMap((name) => {
    const job = workflow.jobs?.[name];
    if (!job) return [`${name}: in test-scope.json but not a ci job`];
    const steps = job.steps ?? [];
    return [
      ...["if", "continue-on-error"].filter((key) => key in job).map((key) => `${name}: the job has ${key}, so its proof can be skipped`),
      ...(JSON.stringify(steps.at(-1)) === JSON.stringify(PROOF) ? [] : [`${name}: the last step is not exactly ${JSON.stringify(PROOF)}`]),
      ...steps.slice(0, -1).filter((step) => step.run === PROOF.run).map(() => `${name}: the proof runs before the last step`),
    ];
  });
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
  const job = (patch) => ({ jobs: { ...workflow.jobs, "test-app": { ...workflow.jobs["test-app"], ...patch } } });
  const steps = workflow.jobs["test-app"].steps;
  assert.deepEqual(proofProblems(job({ if: "false" }), scope), ["test-app: the job has if, so its proof can be skipped"]);
  assert.deepEqual(proofProblems(job({ "continue-on-error": true }), scope), ["test-app: the job has continue-on-error, so its proof can be skipped"]);
  assert.deepEqual(proofProblems(job({ steps: [...steps.slice(0, -1), { ...PROOF, if: "always()" }] }), scope), [`test-app: the last step is not exactly ${JSON.stringify(PROOF)}`]);
  assert.deepEqual(proofProblems(job({ steps: [...steps.slice(0, -1), { ...PROOF, run: `${PROOF.run} || true` }] }), scope), [`test-app: the last step is not exactly ${JSON.stringify(PROOF)}`]);
  assert.deepEqual(proofProblems(job({ steps: [...steps, { run: "echo later" }] }), scope), [`test-app: the last step is not exactly ${JSON.stringify(PROOF)}`, "test-app: the proof runs before the last step"]);
  assert.deepEqual(proofProblems({ jobs: { ...workflow.jobs, "test-mac": undefined } }, scope), ["test-mac: in test-scope.json but not a ci job"]);
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
  assert.equal(LIMIT, "tracked code can forge the report");
});
