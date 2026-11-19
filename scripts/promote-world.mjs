import { spawnSync } from "node:child_process";
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
  appendFileSync(process.env.GH_CALLS, verb + " " + (verb === "create" ? after("--title") : args[2]) + "\\n");
  if (verb !== "close") appendFileSync(process.env.GH_CALLS + ".bodies", after("--body") + "\\n---\\n");
} else if (args[1].endsWith("/git/ref/heads/staging")) {
  console.log(world.staging);
} else if (args[1].includes("/actions/runs/")) {
  if (!world.jobs) process.exit(1);
  process.stdout.write(execFileSync("jq", ["-r", after("-q")], { input: JSON.stringify({ jobs: world.jobs }), encoding: "utf8" }));
} else if (args.includes("PATCH")) {
  appendFileSync(process.env.GH_CALLS, "move " + after("-f") + "\\n");
} else {
  const status = world.compare[args[1].split("/compare/")[1]];
  if (!status) process.exit(1);
  console.log(status);
}
`;
writeFileSync(join(top, "gh"), fakeGh, { mode: 0o755 });

export const SHA = "b".repeat(40);
export const bot = { is_bot: true, login: "app/github-actions" };
export const red = (number, sha, author = bot) => ({ number, title: `staging is red at ${sha}`, author });
let runs = 0;
export function promote(result, world, run = {}) {
  const calls = join(top, `calls-${runs++}`);
  writeFileSync(calls, "");
  writeFileSync(`${calls}.json`, JSON.stringify({ staging: SHA, ...world }));
  const event = { EVENT: "push", WORKFLOW_PATH: ".github/workflows/ci.yml", WORKFLOW_NAME: "ci", HEAD_REPO: "o/r", HEAD_BRANCH: "staging", SHA, ...run };
  const env = { ...process.env, PATH: `${top}:${process.env.PATH}`, GH_WORLD: `${calls}.json`, GH_CALLS: calls, GITHUB_STEP_SUMMARY: `${calls}.summary`, REPO: "o/r", RESULT: result, RUN_URL: "https://example.com/run", RUN_ID: "42", ...event };
  const r = spawnSync("bash", [PROMOTE], { env, encoding: "utf8" });
  const bodies = existsSync(`${calls}.bodies`) ? readFileSync(`${calls}.bodies`, "utf8").split("\n---\n").filter(Boolean) : [];
  return { status: r.status, out: r.stdout + r.stderr, calls: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean), bodies };
}
