import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup } from "./test-cleanup.mjs";

const PROMOTE = fileURLToPath(new URL("promote.sh", import.meta.url));
const top = mkdtempSync(join(tmpdir(), "promote-"));
cleanup([top]);

const fakeGh = `#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const world = JSON.parse(readFileSync(process.env.GH_WORLD, "utf8"));
const save = () => writeFileSync(process.env.GH_WORLD, JSON.stringify(world));
const after = (flag) => args[args.indexOf(flag) + 1];
const jq = (value) => process.stdout.write(execFileSync("jq", ["-r", after("-q")], { input: JSON.stringify(value), encoding: "utf8" }));
const nth = (key, value) => {
  if (!Array.isArray(value)) return value;
  world.reads = world.reads ?? {};
  const n = (world.reads[key] = (world.reads[key] ?? -1) + 1);
  save();
  return value[Math.min(n, value.length - 1)];
};
const [group, verb] = args;
if (group === "issue" && verb === "list") {
  const phrase = after("--search").match(/"(.+)"/)[1];
  jq(world.issues.filter((issue) => issue.title.includes(phrase)));
} else if (group === "issue" && verb === "view") {
  jq(world.issues.find((issue) => issue.number === Number(args[2])));
} else if (group === "issue") {
  appendFileSync(process.env.GH_CALLS, verb + " " + (verb === "create" ? after("--title") : args[2]) + "\\n");
  if (verb !== "close") appendFileSync(process.env.GH_CALLS + ".bodies", after("--body") + "\\n---\\n");
  if (verb === "create") world.issues.push({ number: 100 + world.issues.length, title: after("--title"), author: { is_bot: true, login: "app/github-actions" }, body: after("--body") });
  if (verb === "edit") world.issues.find((issue) => issue.number === Number(args[2])).body = after("--body");
  if (verb === "close") world.issues = world.issues.filter((issue) => issue.number !== Number(args[2]));
  save();
} else if (args[1].endsWith("/git/ref/heads/staging")) {
  const staging = nth("staging", world.staging);
  if (staging === null) process.exit(1);
  console.log(staging);
} else if (args[1].endsWith("/git/ref/heads/main")) {
  console.log(world.main);
} else if (args[1].includes("/actions/workflows/ci.yml/runs?")) {
  const query = new URLSearchParams(args[1].split("?")[1]);
  jq({ workflow_runs: (world.ciRuns ?? []).filter((r) => r.head_branch === query.get("branch") && r.head_sha === query.get("head_sha") && r.status === query.get("status")) });
} else if (args[1].includes("/actions/runs/")) {
  if (!world.jobs) process.exit(1);
  jq({ jobs: world.jobs });
} else if (args.includes("PATCH")) {
  appendFileSync(process.env.GH_CALLS, "move " + after("-f") + "\\n");
} else {
  const key = args[1].split("/compare/")[1];
  const status = nth(key, world.compare[key]);
  if (!status) process.exit(1);
  console.log(status);
}
`;
writeFileSync(join(top, "gh"), fakeGh, { mode: 0o755 });

export const SHA = "b".repeat(40);
export const bot = { is_bot: true, login: "app/github-actions" };
export const red = (number, sha, author = bot) => ({ number, title: `staging is red at ${sha}`, author });
const [realRun] = JSON.parse(readFileSync(new URL("promote-ci-runs.json", import.meta.url), "utf8")).workflow_runs;
const REPO = realRun.head_repository.full_name;
let runs = 0;
function prepare(result, world, run) {
  const calls = join(top, `calls-${runs++}`);
  writeFileSync(calls, "");
  const worldFile = typeof world === "string" ? world : `${calls}.json`;
  if (typeof world !== "string") writeFileSync(worldFile, JSON.stringify({ staging: SHA, issues: [], ...world }));
  const event = { EVENT: "push", WORKFLOW_PATH: ".github/workflows/ci.yml", WORKFLOW_NAME: "ci", HEAD_REPO: REPO, HEAD_BRANCH: "staging", SHA, ...run };
  const env = { ...process.env, PATH: `${top}:${process.env.PATH}`, GH_WORLD: worldFile, GH_CALLS: calls, GITHUB_STEP_SUMMARY: `${calls}.summary`, REPO, RESULT: result, RUN_URL: "https://example.com/run", RUN_ID: "42", ...event };
  const done = (status, out) => {
    const bodies = existsSync(`${calls}.bodies`) ? readFileSync(`${calls}.bodies`, "utf8").split("\n---\n").filter(Boolean) : [];
    return { status, out, calls: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean), bodies, world: worldFile };
  };
  return { env, done };
}
export function promote(result, world, run = {}) {
  const { env, done } = prepare(result, world, run);
  const r = spawnSync("bash", [PROMOTE], { env, encoding: "utf8" });
  return done(r.status, r.stdout + r.stderr);
}
export function promoteLater(result, world, run = {}) {
  const { env, done } = prepare(result, world, run);
  const child = spawn("bash", [PROMOTE], { env });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  return new Promise((resolve) => child.on("close", (status) => resolve(done(status, out))));
}

const unsetByDispatch = { EVENT: "", SHA: "", RESULT: "", RUN_URL: "", RUN_ID: "", WORKFLOW_PATH: "", WORKFLOW_NAME: "", HEAD_REPO: "", HEAD_BRANCH: "" };
export const readsCi = (world, trigger = "workflow_dispatch", run = {}) => promote("", world, { ...unsetByDispatch, TRIGGER: trigger, REF: "refs/heads/main", ...run });
export const readsCiLater = (world, trigger = "workflow_dispatch", run = {}) => promoteLater("", world, { ...unsetByDispatch, TRIGGER: trigger, REF: "refs/heads/main", ...run });
export const ciRun = (sha, conclusion, more = {}) => ({ ...realRun, head_sha: sha, conclusion, ...more });
