#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const REPO = "FRIKKern/barkpark";
const [pr, reviewed, ...rest] = process.argv.slice(2);
const knownRed = rest.flatMap((a, i) => rest[i - 1] === "--known-red" ? [a] : []);
if (!/^\d+$/.test(pr ?? "") || !/^[0-9a-f]{7,40}$/.test(reviewed ?? "")) { console.error("usage: node scripts/merge-pr.mjs <barkpark PR number> <reviewed head sha>"); process.exit(2); }

const env = { ...process.env, GH_TOKEN: execFileSync("gh", ["auth", "token", "-u", "FRIKKern"], { encoding: "utf8" }).trim() };
const gh = (args) => execFileSync("gh", args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = () => {
  try { return JSON.parse(gh(["pr", "checks", pr, "-R", REPO, "--json", "name,bucket"])); }
  catch (e) { return e.stdout ? JSON.parse(e.stdout) : []; }
};

const head = gh(["pr", "view", pr, "-R", REPO, "--json", "headRefOid", "-q", ".headRefOid"]).trim();
if (!head.startsWith(reviewed)) { console.error(`merge-pr: head is ${head.slice(0, 10)}, review passed ${reviewed}; review the new head first`); process.exit(1); }
const required = gh(["api", `repos/${REPO}/branches/main/protection/required_status_checks`, "-q", ".contexts[]"]).trim().split("\n").filter(Boolean);
const redOnMain = JSON.parse(gh(["api", `repos/${REPO}/commits/main/check-runs?per_page=100`, "-q", "[.check_runs[] | select(.conclusion == \"failure\") | .name]"])).filter((name) => required.includes(name));
if (redOnMain.length && !rest.includes("--fixes-main")) { console.error(`merge-pr: main is red on ${redOnMain.join(", ")}; fix main first, or pass --fixes-main for the PR that does`); process.exit(1); }
const running = () => JSON.parse(gh(["run", "list", "-R", REPO, "--commit", head, "--json", "status", "--limit", "100"])).filter((r) => r.status !== "completed").length;
let list = checks();
for (let waited = 0; !list.length || list.some((c) => c.bucket === "pending") || running() > 0; waited++) {
  if (waited > 90) { console.error(`merge-pr: checks still running after 90 min on ${head.slice(0, 10)}`); process.exit(1); }
  await sleep(60_000);
  list = checks();
}
const missing = required.filter((name) => !list.some((c) => c.name === name && c.bucket === "pass"));
const blocking = [...list.filter((c) => c.bucket === "fail" || c.bucket === "cancel").filter((c) => !/advisory/i.test(c.name) && !knownRed.includes(c.name)),...missing.map((name) => ({ name: `${name} (required, not passed)` }))];
const tally = Object.entries(Object.groupBy(list, (c) => c.bucket)).map(([b, cs]) => `${cs.length} ${b}`).join(", ");
if (blocking.length) { console.error(`merge-pr: not merged (${tally}); blocking: ${blocking.map((c) => c.name).join(", ")}`); process.exit(1); }
const prepushRunning = () => execFileSync("ps", ["-axo", "command"], { encoding: "utf8" }).split("\n").some((c) => /^node \S*heavy\.mjs npm run prepush/.test(c));
for (let waited = 0; prepushRunning(); waited++) {
  if (waited === 0) console.error("merge-pr: a Barkever prepush is running against guerrilla; waiting so the deploy can't land mid-run");
  if (waited > 30) { console.error("merge-pr: prepush still running after 30 min"); process.exit(1); }
  await sleep(60_000);
}
if (gh(["pr", "view", pr, "-R", REPO, "--json", "headRefOid", "-q", ".headRefOid"]).trim() !== head) { console.error("merge-pr: head moved while waiting; run again"); process.exit(1); }
gh(["pr", "merge", pr, "-R", REPO, "--squash", "--match-head-commit", head]);
const merged = JSON.parse(gh(["pr", "view", pr, "-R", REPO, "--json", "state,mergeCommit"]));
console.log(`merge-pr: #${pr} ${merged.state} as ${merged.mergeCommit?.oid?.slice(0, 10)} (${tally})`);
