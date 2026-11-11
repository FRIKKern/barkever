import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup } from "./test-cleanup.mjs";

const workflow = readFileSync(new URL("../.github/workflows/promote.yml", import.meta.url), "utf8");
const step = workflow.split("        run: |\n")[1].split("\n").map((line) => line.slice(10)).join("\n");
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
function promote(result, world) {
  const calls = join(top, `calls-${runs++}`);
  writeFileSync(calls, "");
  writeFileSync(`${calls}.json`, JSON.stringify(world));
  const env = { ...process.env, PATH: `${top}:${process.env.PATH}`, GH_WORLD: `${calls}.json`, GH_CALLS: calls, GITHUB_STEP_SUMMARY: `${calls}.summary`, REPO: "o/r", SHA, RESULT: result, RUN_URL: "https://example.com/run" };
  const r = spawnSync("bash", ["-c", step], { env, encoding: "utf8" });
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
