import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup } from "./test-cleanup.mjs";
import { load } from "./workflow-keys.mjs";

const PROMOTE = fileURLToPath(new URL("promote.sh", import.meta.url));
const top = mkdtempSync(join(tmpdir(), "promote-"));
cleanup([top]);

const fakeGh = `#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
const world = JSON.parse(readFileSync(process.env.GH_WORLD, "utf8"));
const after = (flag) => args[args.indexOf(flag) + 1];
const [group, verb] = args;
if (group === "issue" && verb === "list") {
  const phrase = after("--search").match(/"(.+)"/)[1];
  const found = world.issues.filter((issue) => issue.title.includes(phrase));
  process.stdout.write(execFileSync("jq", ["-r", after("-q")], { input: JSON.stringify(found), encoding: "utf8" }));
} else if (group === "issue") {
  appendFileSync(process.env.GH_CALLS, verb + " " + (verb === "close" ? args[2] : after("--title")) + "\\n");
} else if (args[1].endsWith("/git/ref/heads/staging")) {
  console.log(world.staging);
} else if (args.includes("PATCH")) {
  appendFileSync(process.env.GH_CALLS, "move " + after("-f") + "\\n");
} else {
  const status = world.compare[args[1].split("/compare/")[1]];
  if (!status) process.exit(1);
  console.log(status);
}
`;
writeFileSync(join(top, "gh"), fakeGh, { mode: 0o755 });

const SHA = "b".repeat(40);
const bot = { is_bot: true, login: "app/github-actions" };
const red = (number, sha, author = bot) => ({ number, title: `staging is red at ${sha}`, author });
let runs = 0;
function promote(result, world, run = {}) {
  const calls = join(top, `calls-${runs++}`);
  writeFileSync(calls, "");
  writeFileSync(`${calls}.json`, JSON.stringify({ staging: SHA, ...world }));
  const event = { EVENT: "push", WORKFLOW_PATH: ".github/workflows/ci.yml", WORKFLOW_NAME: "ci", HEAD_REPO: "o/r", HEAD_BRANCH: "staging", SHA, ...run };
  const env = { ...process.env, PATH: `${top}:${process.env.PATH}`, GH_WORLD: `${calls}.json`, GH_CALLS: calls, GITHUB_STEP_SUMMARY: `${calls}.summary`, REPO: "o/r", RESULT: result, RUN_URL: "https://example.com/run", ...event };
  const r = spawnSync("bash", [PROMOTE], { env, encoding: "utf8" });
  return { status: r.status, out: r.stdout + r.stderr, calls: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean) };
}

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

test("a red run opens one issue while main lacks the sha, and none once main holds it", () => {
  const lacks = promote("failure", { issues: [], compare: { [`main...${SHA}`]: "ahead" } });
  assert.deepEqual([lacks.status, lacks.calls], [0, ["create staging is red at bbbbbbbbbb"]]);
  const open = promote("failure", { issues: [red(1, "bbbbbbbbbb")], compare: { [`main...${SHA}`]: "ahead" } });
  assert.deepEqual([open.status, open.calls], [0, []]);
  const holds = promote("failure", { issues: [], compare: { [`main...${SHA}`]: "behind" } });
  assert.deepEqual([holds.status, holds.calls], [0, []]);
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

test("a run on staging's head that promote does not recognise turns red with one plain sentence, and main stays", () => {
  const ahead = { issues: [], compare: { [`main...${SHA}`]: "ahead" } };
  for (const [name, run] of [["another workflow file", { WORKFLOW_PATH: ".github/workflows/other.yml" }], ["the path with a ref", { WORKFLOW_PATH: ".github/workflows/ci.yml@refs/heads/staging" }], ["another workflow name", { WORKFLOW_NAME: "build" }]]) {
    for (const result of ["success", "failure"]) {
      const r = promote(result, ahead, run);
      assert.deepEqual([r.status, r.calls], [1, []], `${name}, ${result}: ${r.out}`);
      assert.match(r.out, /^::error::A run named \S+ from \S+ finished on staging's head, and promote knows only ci from \.github\/workflows\/ci\.yml, so main did not move\.$/m, name);
    }
  }
  const elsewhere = promote("success", ahead, { WORKFLOW_PATH: ".github/workflows/other.yml", HEAD_BRANCH: "feature" });
  assert.deepEqual([elsewhere.status, elsewhere.calls], [0, []], "off staging it stays a quiet skip");
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
