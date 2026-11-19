import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { ciRun, readsCi, readsCiLater } from "./promote-world.mjs";
import { load } from "./workflow-keys.mjs";

const H = "c".repeat(40);
const M = "d".repeat(40);
const OLD = "e".repeat(40);
const N = "f".repeat(40);
const behind = (more = {}) => ({ staging: H, main: M, compare: { [`main...${H}`]: "ahead" }, ...more });
const jobs = [{ name: "test-scripts", conclusion: "failure" }];

test("promote's rules hold on the read path: only a completed green run for staging's exact head moves main", () => {
  const still = {
    "a run for an older head": [ciRun(OLD, "success")],
    "a run in progress": [ciRun(H, null, { status: "in_progress" })],
    "a cancelled run": [ciRun(H, "cancelled")],
    "no run at all": [],
    "a pull request run": [ciRun(H, "success", { event: "pull_request" })],
    "a run on another branch": [ciRun(H, "success", { head_branch: "feature" })],
    "another workflow": [ciRun(H, "success", { path: ".github/workflows/other.yml", name: "other" })],
  };
  for (const [name, ciRuns] of Object.entries(still)) {
    const r = readsCi(behind({ ciRuns }));
    assert.deepEqual([r.status, r.calls], [0, []], `${name}: ${r.out}`);
    assert.match(r.out, /^nothing promoted: /m, name);
  }
  for (const [name, ciRuns] of Object.entries({ "a skipped run": [ciRun(H, "skipped")], "a red run after a green one": [ciRun(H, "success"), ciRun(H, "failure", { created_at: "2026-11-19T13:00:00Z" })] })) {
    const r = readsCi(behind({ ciRuns, jobs }));
    assert.deepEqual([r.status, r.calls], [0, ["create staging is red"]], `${name}: ${r.out}`);
  }
  const { jobs: { promote: job } } = load(readFileSync(new URL("../.github/workflows/promote.yml", import.meta.url), "utf8"));
  assert.equal(job.if, "github.event_name == 'workflow_run' || github.ref == 'refs/heads/main'");
  const elsewhere = readsCi(behind({ ciRuns: [ciRun(H, "success")] }), "workflow_dispatch", { REF: "refs/heads/feature" });
  assert.deepEqual([elsewhere.status, elsewhere.calls, elsewhere.out.trim()], [0, [], "nothing promoted: promote runs from main only, not refs/heads/feature"], "a dispatch from another branch does nothing");
  const unknown = readsCi(behind({ ciRuns: [ciRun(H, "success")] }), "repository_dispatch");
  assert.deepEqual([unknown.status, unknown.calls], [1, []], unknown.out);
});

test("the run that finished last decides, so a re-run of an older run counts as newest; equal finish times go to the higher id", () => {
  const rerun = ciRun(H, "success", { id: 1, created_at: "2026-11-19T12:00:00Z", updated_at: "2026-11-19T13:00:00Z", run_attempt: 2 });
  const later = ciRun(H, "failure", { id: 2, created_at: "2026-11-19T12:30:00Z", updated_at: "2026-11-19T12:40:00Z" });
  const r = readsCi(behind({ ciRuns: [later, rerun], jobs }));
  assert.deepEqual([r.status, r.calls], [0, [`move sha=${H}`]], r.out);
  const tie = readsCi(behind({ ciRuns: [{ ...rerun, id: 3, conclusion: "failure" }, { ...later, id: 2, conclusion: "success", updated_at: rerun.updated_at }], jobs }));
  assert.deepEqual([tie.status, tie.calls], [0, ["create staging is red"]], tie.out);
});

test("nothing to do is quiet: staging at main's head exits 0 with one line and touches no issue", () => {
  const issues = [{ number: 7, title: "staging is red", author: { is_bot: true, login: "app/github-actions" }, body: `ci ended as failure on \`${OLD}\`` }];
  const r = readsCi({ staging: H, main: H, issues, ciRuns: [ciRun(H, "failure")], jobs, compare: { [`main...${H}`]: "identical" } }, "schedule");
  assert.deepEqual([r.status, r.calls, r.out.trim().split("\n")], [0, [], [`nothing promoted: main already holds staging's head ${H}`]]);
});

test("two promotes cannot cross: one queue, and staging and main are read again right before main moves", () => {
  const { concurrency, on } = load(readFileSync(new URL("../.github/workflows/promote.yml", import.meta.url), "utf8"));
  assert.deepEqual(concurrency, { group: "promote", "cancel-in-progress": false });
  assert.deepEqual(Object.keys(on).sort(), ["workflow_dispatch", "workflow_run"]);
  const staged = readsCi(behind({ staging: [H, H, N], ciRuns: [ciRun(H, "success")] }));
  assert.deepEqual([staged.status, staged.calls], [0, []], staged.out);
  assert.match(staged.out, /staging moved off/);
  const mained = readsCi(behind({ ciRuns: [ciRun(H, "success")], compare: { [`main...${H}`]: ["ahead", "identical"] } }));
  assert.deepEqual([mained.status, mained.calls], [0, []], mained.out);
  assert.match(mained.out, /main moved while promote ran/);
});

test("fifteen scheduled runs on one red head keep one issue, and a green newer head closes it", async () => {
  const first = readsCi(behind({ ciRuns: [ciRun(H, "failure")], jobs }), "schedule");
  assert.deepEqual(first.calls, ["create staging is red"], first.out);
  assert.equal(first.bodies[0].split("\n")[0], "This text is rewritten by the workflow; write in a comment.");
  const attempt2 = JSON.parse(readFileSync(first.world, "utf8"));
  Object.assign(attempt2, { jobs: [{ name: "test-app", conclusion: "failure" }], ciRuns: [{ ...attempt2.ciRuns[0], run_attempt: 2, updated_at: "2026-11-19T14:00:00Z" }] });
  writeFileSync(first.world, JSON.stringify(attempt2));
  const rerun = readsCi(first.world, "schedule");
  assert.deepEqual(rerun.calls, ["edit 100"], "a re-run on the same run page that fails another check updates the job list once");
  assert.match(rerun.bodies[0], /^- the app tests \(`test-app`\)$/m);
  const repeats = await Promise.all(Array.from({ length: 14 }, () => readsCiLater(first.world, "schedule")));
  assert.deepEqual(repeats.map((r) => r.calls), Array(14).fill([]), "fourteen more runs that would write the same body open and edit nothing");
  assert.equal(JSON.parse(readFileSync(first.world, "utf8")).issues.length, 1);
  const world = JSON.parse(readFileSync(first.world, "utf8"));
  world.issues.push({ number: 101, title: "staging is red", author: world.issues[0].author, body: "Run: https://example.com/run/x" });
  Object.assign(world, { staging: N, ciRuns: [...world.ciRuns, ciRun(N, "success")], compare: { [`main...${N}`]: "ahead", [`${H}...${N}`]: "ahead" } });
  writeFileSync(first.world, JSON.stringify(world));
  assert.deepEqual(readsCi(first.world, "schedule").calls, [`move sha=${N}`, "close 100", "close 101"], "the red issue closes, and so does one that names no head");
});
