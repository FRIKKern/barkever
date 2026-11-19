import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHA, bot, promote, red } from "./promote-world.mjs";
import { load } from "./workflow-keys.mjs";

const issues = [red(1, "bbbbbbbbbb"), red(2, "aaaaaaaaaa"), red(3, "cccccccccc"), red(4, "dddddddddd"), red(5, "aaaaaaaaaa", { is_bot: false, login: "someone" }), { ...red(6, "aaaaaaaaaa"), title: "staging is red at aaaaaaaaaa; echo x" }];
const compare = { "bbbbbbbbbb...": "identical", "aaaaaaaaaa...": "ahead", "cccccccccc...": "diverged" };
const history = Object.fromEntries(Object.entries(compare).map(([from, status]) => [from + SHA, status]));

test("when main moves, the bot closes its own red issues for that sha and older ones, and no others", () => {
  const r = promote("success", { issues, compare: { ...history, [`main...${SHA}`]: "ahead" } });
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.calls, [`move sha=${SHA}`, "close 1", "close 2"]);
});

test("a green run on a sha main already holds closes the red issues too", () => {
  const r = promote("success", { issues, compare: { ...history, [`main...${SHA}`]: "behind" } });
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.calls, ["close 1", "close 2"]);
});

test("a red run keeps ONE issue naming the failed ci jobs in product words: a later red head edits it, and none opens once main holds the sha", () => {
  const jobs = [{ name: "check", conclusion: "success" }, { name: "test-scripts", conclusion: "failure" }, { name: "odd job; rm -rf /", conclusion: "timed_out" }, { name: "build", conclusion: "skipped" }];
  const lacks = promote("failure", { issues: [], jobs, compare: { [`main...${SHA}`]: "ahead" } });
  assert.deepEqual([lacks.status, lacks.calls], [0, ["create staging is red"]], lacks.out);
  assert.equal(lacks.bodies[0], `ci ended as failure on \`${SHA}\`, so main stays where it is.\n\nChecks that failed:\n- the script tests (\`test-scripts\`)\n- \`odd job rm -rf /\`\n\nMain moves again once ci is green on a later staging head; this issue then closes.\nRun: https://example.com/run`);
  const mine = { number: 7, title: "staging is red", author: bot, body: `ci ended as failure on \`${"a".repeat(40)}\`` };
  const later = promote("failure", { issues: [mine, { ...mine, number: 9 }, { ...mine, number: 3, author: { is_bot: false, login: "someone" } }], jobs, compare: { [`main...${SHA}`]: "ahead" } });
  assert.deepEqual([later.status, later.calls], [0, ["edit 7"]], later.out);
  const nojobs = promote("failure", { issues: [], compare: { [`main...${SHA}`]: "ahead" } });
  assert.match(nojobs.bodies[0], /^- the run page lists them$/m, "a jobs lookup that fails still opens the issue");
  const holds = promote("failure", { issues: [], jobs, compare: { [`main...${SHA}`]: "behind" } });
  assert.deepEqual([holds.status, holds.calls], [0, []]);
  const green = promote("success", { issues: [mine], compare: { [`main...${SHA}`]: "ahead", [`${"a".repeat(40)}...${SHA}`]: "ahead" } });
  assert.deepEqual(green.calls, [`move sha=${SHA}`, "close 7"], "main moving past the red head closes the one issue");
});

test("a dispatched ci run on staging's head moves main like a pushed one", () => {
  const r = promote("success", { issues: [], compare: { [`main...${SHA}`]: "ahead" } }, { EVENT: "workflow_dispatch" });
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.calls, [`move sha=${SHA}`]);
});

test("promote moves main only to staging's head, from ci on staging in this repo, pushed or dispatched", () => {
  const OLD = "a".repeat(40);
  const ahead = { issues: [], compare: { [`main...${SHA}`]: "ahead", [`main...${OLD}`]: "ahead" } };
  const refused = {
    "a dispatch on a feature branch": [{ EVENT: "workflow_dispatch", HEAD_BRANCH: "feature" }, {}],
    "a stale run after staging moved": [{ SHA: OLD }, {}],
    "a tag named staging on another commit": [{ EVENT: "workflow_dispatch", HEAD_BRANCH: "staging", SHA: OLD }, {}],
    "a pull request run": [{ EVENT: "pull_request" }, {}],
    "a run from a fork": [{ HEAD_REPO: "fork/r" }, {}],
  };
  for (const [name, [run, world]] of Object.entries(refused)) {
    const r = promote("success", { ...ahead, ...world }, run);
    assert.deepEqual([r.status, r.calls], [0, []], `${name}: ${r.out}`);
    assert.match(r.out, /^nothing promoted: /m, name);
  }
  const cancelled = promote("cancelled", { ...ahead, issues: [] });
  assert.deepEqual([cancelled.status, cancelled.calls], [0, []], cancelled.out);
  const late = promote("failure", ahead, { SHA: OLD });
  assert.deepEqual([late.status, late.calls], [0, []], "a red run on a commit staging left opens no issue");
  const racing = [promote("success", ahead, { SHA: OLD }), promote("success", ahead, { SHA })];
  assert.deepEqual(racing.map((r) => r.calls), [[], [`move sha=${SHA}`]], "of two racing runs only the one on staging's head moves main");
});

test("a run on staging's head that promote does not recognise, by workflow or by event, turns red with one plain sentence, and main stays", () => {
  const ahead = { issues: [], compare: { [`main...${SHA}`]: "ahead" } };
  for (const [name, run] of [["another workflow file", { WORKFLOW_PATH: ".github/workflows/other.yml" }], ["the path with a ref", { WORKFLOW_PATH: ".github/workflows/ci.yml@refs/heads/staging" }], ["another workflow name", { WORKFLOW_NAME: "build" }]]) {
    for (const result of ["success", "failure"]) {
      const r = promote(result, ahead, run);
      assert.deepEqual([r.status, r.calls], [1, []], `${name}, ${result}: ${r.out}`);
      assert.match(r.out, /^::error::A run named \S+ from \S+ finished on staging's head, and promote knows only ci from \.github\/workflows\/ci\.yml, so main did not move\.$/m, name);
    }
  }
  for (const result of ["success", "failure"]) {
    const r = promote(result, ahead, { EVENT: "schedule" });
    assert.deepEqual([r.status, r.calls], [1, []], `an unknown event, ${result}: ${r.out}`);
    assert.match(r.out, /^::error::A ci run for a schedule event finished on staging's head, and promote moves main only after a push or a dispatch, so main did not move\.$/m);
  }
  for (const [name, run] of [["another workflow off staging", { WORKFLOW_PATH: ".github/workflows/other.yml", HEAD_BRANCH: "feature" }], ["an unknown event off staging", { EVENT: "schedule", HEAD_BRANCH: "feature" }], ["an unknown event on an old commit", { EVENT: "schedule", SHA: "a".repeat(40) }]]) {
    const r = promote("success", ahead, run);
    assert.deepEqual([r.status, r.calls], [0, []], `${name} stays a quiet skip: ${r.out}`);
  }
});

test("ci runs the same jobs for a dispatch as for a push: no inputs, and no condition reads the event", () => {
  const text = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const ci = load(text);
  assert.equal(ci.on.workflow_dispatch, null);
  assert.doesNotMatch(text, /event_name|inputs\./);
  const conditions = Object.entries(ci.jobs).flatMap(([name, job]) => [["job", name, job.if], ...(job.steps ?? []).map((step, i) => ["step", `${name}[${i}]`, step.if])]).filter(([, , cond]) => cond !== undefined);
  assert.deepEqual(conditions, [["job", "e2e", "needs.e2e-gate.outputs.run == 'true'"]]);
  assert.deepEqual(Object.keys(ci.jobs), ["scan", "check", "build", "test-scripts", "test-app", "test-mac", "e2e-gate", "e2e"]);
});
