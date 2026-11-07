import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup } from "./test-cleanup.mjs";

const root = new URL("..", import.meta.url).pathname;
const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...inherited } = process.env;
const baseEnv = { ...inherited, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const tops = [];
cleanup(() => { for (const top of tops) rmSync(top, { recursive: true, force: true }); });

const FAKE_GH = `#!/usr/bin/env node
const fs = require("node:fs");
const stateFile = process.env.FAKE_GITHUB;
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const args = process.argv.slice(2);
const path = args.find((a) => a.startsWith("repos/"));
if (!path || !path.startsWith("repos/FRIKKern/barkever/")) { console.error("wrong repo " + path); process.exit(4); }
const [kind, rest] = path.slice("repos/FRIKKern/barkever/".length).split("?");
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));
if (!args.includes("-X")) {
  const [collection] = kind.split("/");
  let rows = state[collection];
  if (collection === "issues" && !(rest ?? "").includes("state=all")) rows = rows.filter((r) => r.state === "open");
  if (collection === "milestones" && !(rest ?? "").includes("state=all")) rows = rows.filter((r) => r.state === "open");
  if (collection === "issues") rows = [...rows].reverse();
  if (!args.includes("--paginate")) rows = rows.slice(0, 1);
  for (const row of rows) console.log(JSON.stringify(row));
  process.exit(0);
}
const method = args[args.indexOf("-X") + 1];
const fields = JSON.parse(fs.readFileSync(0, "utf8"));
const [collection, id] = kind.split("/");
if (collection === "issues" && method === "POST" && "state" in fields) { console.error("POST issue takes no state"); process.exit(5); }
state.log.push(method + " " + kind + (fields.state ? " " + fields.state : ""));
let row;
if (method === "POST") {
  row = { number: state.next++, state: "open", ...fields };
  state[collection].push(row);
} else {
  row = state[collection].find((r) => String(r.number) === id);
  Object.assign(row, fields);
}
if (collection === "issues") {
  if (typeof row.milestone === "number") row.milestone = { number: row.milestone };
  if (row.labels) row.labels = row.labels.map((l) => (typeof l === "string" ? { name: l } : l));
}
save();
console.log(JSON.stringify(row));
`;

const FAKE_BP = `#!/usr/bin/env node
const fs = require("node:fs");
const board = JSON.parse(fs.readFileSync(process.env.FAKE_BOARD, "utf8"));
const reply = board[process.argv[4]];
if (!reply) process.exit(3);
console.log(JSON.stringify(reply));
`;

const OLD_PICTURE = "old picture\n";
const criterion = (text, met = false) => ({ criterion: text, met, ...(met && { evidence: "ran" }) });
const goodBoard = () => ({
  "task-42e5633d742184c5": {
    children: [
      { doc_id: "task-aa", title: "P0 Ground", lifecycle_status: "done" },
      { doc_id: "task-bb", title: "P1 Web", lifecycle_status: "open" },
    ],
  },
  "task-aa": { doc: { doc_id: "task-aa", lifecycle_status: "done", content: { acceptance_criteria: [criterion("First push", true)] } }, children: [] },
  "task-bb": {
    doc: { doc_id: "task-bb", lifecycle_status: "open", content: { acceptance_criteria: [criterion("J01 Capture passes")] } },
    children: [{ title: "Shell", lifecycle_status: "done" }, { title: "Sidebar", lifecycle_status: "open" }],
  },
});

function sandbox({ originName = "FRIKKern/barkever.git", board = goodBoard(), github } = {}) {
  const top = realpathSync(mkdtempSync(join(tmpdir(), "publish-")));
  tops.push(top);
  const env = { ...baseEnv, HOME: top, PATH: `${join(top, "bin")}:${baseEnv.PATH}`, FAKE_GITHUB: join(top, "github.json"), FAKE_BOARD: join(top, "board.json") };
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  mkdirSync(join(top, "bin"));
  for (const [name, body] of [["gh", FAKE_GH], ["bp", FAKE_BP]]) { writeFileSync(join(top, "bin", name), body); chmodSync(join(top, "bin", name), 0o755); }
  writeFileSync(env.FAKE_BOARD, JSON.stringify(board));
  writeFileSync(env.FAKE_GITHUB, JSON.stringify(github ?? { labels: [], milestones: [], issues: [], log: [], next: 1 }));

  const origin = join(top, originName);
  mkdirSync(join(origin, ".."), { recursive: true });
  git(top, "init", "-q", "--bare", "-b", "main", origin);
  const main = join(top, "main");
  git(top, "init", "-q", "-b", "main", main);
  for (const dir of ["scripts", "docs/img", "design", "app/e2e", "mac/e2e"]) mkdirSync(join(main, dir), { recursive: true });
  cpSync(join(root, "scripts/roadmap.mjs"), join(main, "scripts/roadmap.mjs"));
  cpSync(join(root, "scripts/roadmap"), join(main, "scripts/roadmap"), { recursive: true });
  cpSync(join(root, "scripts/secrets.mjs"), join(main, "scripts/secrets.mjs"));
  cpSync(join(root, "scripts/scan-outgoing.mjs"), join(main, "scripts/scan-outgoing.mjs"));
  writeFileSync(join(main, "scripts/check-repo.mjs"), "process.exit(Number(process.env.CHECK_RC ?? 0));\n");
  cpSync(join(root, "design/tokens.json"), join(main, "design/tokens.json"));
  writeFileSync(join(main, "docs/ROADMAP.md"), "Heading to: signed off\n\n| Id | Milestone | After | Reward |\n|---|---|---|---|\n| P0 | Ground | | Rules |\n| P1 | Web | P0 | Notes |\n");
  writeFileSync(join(main, "JOURNEYS.md"), "| ID | Journey | Passes when |\n|---|---|---|\n| J01 | Capture | Fast. Really |\n");
  writeFileSync(join(main, "app/e2e/j01-capture.spec.ts"), "");
  writeFileSync(join(main, "mac/e2e/mac.spec.ts"), "");
  writeFileSync(join(main, "docs/img/roadmap.svg"), OLD_PICTURE);
  writeFileSync(join(main, "docs/img/journeys.svg"), OLD_PICTURE);
  git(main, "add", ".");
  git(main, "commit", "-qm", "base");
  git(main, "remote", "add", "origin", origin);
  git(main, "push", "-q", "origin", "main");

  const run = (flag = "--publish", extra = {}) => spawnSync("node", ["scripts/roadmap.mjs", ...(flag ? [flag] : [])], { cwd: main, env: { ...env, ...extra }, encoding: "utf8" });
  const github2 = () => JSON.parse(readFileSync(env.FAKE_GITHUB, "utf8"));
  const originHead = () => git(top, "--git-dir", origin, "rev-parse", "main");
  const head = () => git(main, "rev-parse", "HEAD");
  const clean = () => git(main, "status", "--porcelain", "--untracked-files=no") === "";
  return { top, main, env, git: (...args) => git(main, ...args), origin, run, github: github2, originHead, head, clean, setBoard: (b) => writeFileSync(env.FAKE_BOARD, JSON.stringify(b)), setGithub: (g) => writeFileSync(env.FAKE_GITHUB, JSON.stringify(g)) };
}

const assertUntouched = (box, base) => {
  assert.equal(box.head(), base);
  assert.equal(box.originHead(), base);
  assert.ok(box.clean(), "main stays clean");
  assert.equal(readFileSync(join(box.main, "docs/img/roadmap.svg"), "utf8"), box.git("show", "HEAD:docs/img/roadmap.svg") + "\n");
  assert.deepEqual(box.github().log, []);
};

test("publish pushes one picture commit, then makes milestones, issues, and closes done milestones last", () => {
  const box = sandbox();
  const base = box.head();
  const r = box.run();
  assert.equal(r.status, 0, r.stderr);
  assert.notEqual(box.originHead(), base);
  assert.equal(box.originHead(), box.head());
  assert.equal(box.git("rev-parse", "HEAD~1"), base);
  assert.match(box.git("log", "-1", "--format=%s"), /Roadmap: redraw/);
  assert.ok(box.clean());
  const { log, milestones, issues } = box.github();
  assert.equal(milestones.length, 2);
  assert.equal(issues.length, 2);
  const firstIssue = log.findIndex((l) => l.startsWith("POST issues"));
  const closing = log.findIndex((l) => /^PATCH milestones\/\d+ closed/.test(l));
  assert.ok(log.findIndex((l) => l.startsWith("POST milestones")) < firstIssue);
  assert.ok(firstIssue < closing, log.join("|"));
  assert.equal(milestones.find((m) => m.title === "P0 Ground").state, "closed");
  assert.equal(milestones.find((m) => m.title === "P1 Web").state, "open");
  const stamped = issues.find((i) => i.title.startsWith("P0:"));
  assert.equal(stamped.state, "closed");
  assert.equal(stamped.state_reason, "completed");
  assert.equal(issues.find((i) => i.title.startsWith("P1:")).state, "open");
});

test("a second publish commits nothing and writes nothing to GitHub", () => {
  const box = sandbox();
  assert.equal(box.run().status, 0);
  const head = box.head();
  const before = box.github();
  box.setGithub({ ...before, log: [] });
  const r = box.run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(box.head(), head);
  assert.deepEqual(box.github().log, []);
});

test("an issue we closed is not created again, and more than one page is read", () => {
  const box = sandbox();
  assert.equal(box.run().status, 0);
  assert.equal(box.run().status, 0);
  assert.equal(box.github().issues.length, 2);
  assert.equal(box.github().milestones.length, 2);
});

test("a pull request in the issue list is not treated as an issue", () => {
  const box = sandbox();
  assert.equal(box.run().status, 0);
  const state = box.github();
  const copied = state.issues.find((i) => i.title.startsWith("P1:"));
  state.issues.unshift({ ...copied, number: 900, pull_request: {} });
  box.setGithub({ ...state, log: [] });
  assert.equal(box.run().status, 0);
  assert.deepEqual(box.github().log, []);
});

test("a check that fails after the commit leaves main and origin as they were", () => {
  const box = sandbox();
  const base = box.head();
  const r = box.run("--publish", { CHECK_RC: "1" });
  assert.equal(r.status, 1);
  assertUntouched(box, base);
});

test("the secret scan failing also undoes the commit", () => {
  const box = sandbox();
  const base = box.head();
  writeFileSync(join(box.main, "scripts/scan-outgoing.mjs"), "process.exit(1);\n");
  box.git("add", ".");
  box.git("commit", "-qm", "failing scan");
  box.git("push", "-q", "origin", "main");
  const moved = box.head();
  assert.notEqual(moved, base);
  assert.equal(box.run().status, 1);
  assertUntouched(box, moved);
});

test("a locked index leaves the pictures as they were, so the next land still runs", () => {
  const box = sandbox();
  const base = box.head();
  writeFileSync(join(box.main, ".git/index.lock"), "");
  const r = box.run();
  assert.equal(r.status, 1);
  rmSync(join(box.main, ".git/index.lock"));
  assertUntouched(box, base);
});

test("a commit already waiting on main is refused, never pushed past prepush", () => {
  const box = sandbox();
  const pushed = box.head();
  writeFileSync(join(box.main, "unreviewed.txt"), "x");
  box.git("add", "unreviewed.txt");
  box.git("commit", "-qm", "UNREVIEWED");
  const r = box.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not level with origin/);
  assert.equal(box.originHead(), pushed);
  assert.deepEqual(box.github().log, []);
});

test("origin moving first is refused before anything is drawn", () => {
  const box = sandbox();
  const other = join(box.top, "other");
  execFileSync("git", ["clone", "-q", box.origin, other], { env: box.env, stdio: "ignore" });
  writeFileSync(join(other, "y.txt"), "y");
  execFileSync("git", ["add", "y.txt"], { cwd: other, env: box.env });
  execFileSync("git", ["commit", "-qm", "other land"], { cwd: other, env: box.env });
  execFileSync("git", ["push", "-q", "origin", "main"], { cwd: other, env: box.env, stdio: "ignore" });
  const r = box.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not level with origin/);
  assert.ok(box.clean());
  assert.deepEqual(box.github().log, []);
});

test("a commit that lands during the check is never dropped", () => {
  const box = sandbox();
  writeFileSync(join(box.main, "scripts/check-repo.mjs"), `import { execSync } from "node:child_process";
execSync("echo z > z.txt && git add z.txt && git commit -qm ANOTHER", { cwd: new URL("..", import.meta.url).pathname });
process.exit(1);
`);
  box.git("add", ".");
  box.git("commit", "-qm", "check that commits");
  box.git("push", "-q", "origin", "main");
  assert.equal(box.run().status, 1);
  assert.equal(box.git("log", "-1", "--format=%s"), "ANOTHER");
  assert.ok(existsSync(join(box.main, "z.txt")));
});

test("publish refuses a dirty main or another branch", () => {
  const box = sandbox();
  const base = box.head();
  writeFileSync(join(box.main, "JOURNEYS.md"), "dirty");
  const dirty = box.run();
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /clean main/);
  box.git("checkout", "-q", "--", "JOURNEYS.md");
  box.git("checkout", "-q", "-b", "elsewhere");
  const other = box.run();
  assert.equal(other.status, 1);
  assert.match(other.stderr, /runs on main/);
  assert.equal(box.originHead(), base);
  assert.deepEqual(box.github().log, []);
});

test("another land running is refused; a mark left by a dead land is not", async () => {
  const box = sandbox();
  const base = box.head();
  const land = spawn("node", ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" });
  writeFileSync(join(box.main, ".git/land.pid"), String(land.pid));
  const r = box.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /another land is running/);
  assertUntouched(box, base);
  const gone = new Promise((done) => land.on("exit", done));
  land.kill();
  await gone;
  assert.equal(box.run().status, 0);
  assert.equal(box.originHead(), box.head());
});

test("the land that started the publish doesn't count as another land", () => {
  const box = sandbox();
  const script = `const { spawnSync } = require("node:child_process");
require("node:fs").writeFileSync(".git/land.pid", String(process.pid));
process.exit(spawnSync("node", ["scripts/roadmap.mjs", "--publish"], { stdio: "inherit" }).status);`;
  const r = spawnSync("node", ["-e", script], { cwd: box.main, env: box.env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(box.originHead(), box.head());
});

test("a board reply that lost its criteria changes nothing on GitHub or main", () => {
  const box = sandbox();
  assert.equal(box.run().status, 0);
  const head = box.head();
  const state = box.github();
  box.setGithub({ ...state, log: [] });
  const board = goodBoard();
  delete board["task-bb"].doc.content.acceptance_criteria;
  box.setBoard(board);
  const r = box.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no acceptance criteria for P1/);
  assertUntouched(box, head);
});

test("an emptied roadmap table changes nothing", () => {
  const box = sandbox();
  writeFileSync(join(box.main, "docs/ROADMAP.md"), "Heading to: nowhere\n");
  box.git("add", "docs/ROADMAP.md");
  box.git("commit", "-qm", "empty");
  box.git("push", "-q", "origin", "main");
  const base = box.head();
  const r = box.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no milestone rows/);
  assertUntouched(box, base);
});

test("a repo that only looks like Barkever is skipped; another case of the name is not", () => {
  const fork = sandbox({ originName: "FRIKKern/barkever-fork.git" });
  const base = fork.head();
  const r = fork.run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nothing to publish/);
  assertUntouched(fork, base);
  const lower = sandbox({ originName: "frikkern/barkever.git" });
  assert.equal(lower.run().status, 0);
  assert.equal(lower.github().milestones.length, 2);
});

test("a token on the board never reaches GitHub, patterned or known", () => {
  for (const text of [`J01 ${"bp" + "sess_"}${"a".repeat(20)}`, "J01 the-known-config-token"]) {
    const board = goodBoard();
    board["task-bb"].doc.content.acceptance_criteria = [criterion(text)];
    const box = sandbox({ board });
    mkdirSync(join(box.top, ".config/barkpark"), { recursive: true });
    writeFileSync(join(box.top, ".config/barkpark/config.json"), JSON.stringify({ token: "the-known-config-token" }));
    const r = box.run();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /looks like a secret/);
    assert.ok(!box.github().issues.some((issue) => issue.title.includes(text)));
    assert.ok(!r.stderr.includes("the-known-config-token"));
  }
});

test("dry run writes nothing: no pictures, no commit, no GitHub", () => {
  const box = sandbox();
  const base = box.head();
  const r = box.run("--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /"issues": 2/);
  assert.equal(readFileSync(join(box.main, "docs/img/roadmap.svg"), "utf8"), OLD_PICTURE);
  assertUntouched(box, base);
});

test("dry run refuses a secret too", () => {
  const board = goodBoard();
  board["task-bb"].doc.content.acceptance_criteria = [criterion(`J01 ${"bp" + "sess_"}${"a".repeat(20)}`)];
  const r = sandbox({ board }).run("--dry-run");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /looks like a secret/);
});

test("on a later sync, a milestone that just finished closes after its new issue", () => {
  const box = sandbox();
  assert.equal(box.run().status, 0);
  box.setGithub({ ...box.github(), log: [] });
  const board = goodBoard();
  board["task-bb"].doc.lifecycle_status = "done";
  board["task-bb"].doc.content.acceptance_criteria.push(criterion("New rule"));
  box.setBoard(board);
  assert.equal(box.run().status, 0);
  const { log } = box.github();
  const issue = log.findIndex((l) => l.startsWith("POST issues"));
  const closing = log.findIndex((l) => /^PATCH milestones\/\d+ closed/.test(l));
  assert.ok(issue >= 0 && issue < closing, log.join("|"));
});

test("criteria emptied on the board are refused before any picture moves", () => {
  const box = sandbox();
  const board = goodBoard();
  for (const name of ["First", "Second", "Third", "Fourth"]) board["task-bb"].doc.content.acceptance_criteria.push(criterion(name));
  box.setBoard(board);
  assert.equal(box.run().status, 0);
  const head = box.head();
  box.setGithub({ ...box.github(), log: [] });
  const emptied = goodBoard();
  emptied["task-bb"].doc.content.acceptance_criteria = [];
  box.setBoard(emptied);
  const r = box.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refusing to close/);
  assertUntouched(box, head);
});

test("a server token in the config is known as well", () => {
  const board = goodBoard();
  board["task-bb"].doc.content.acceptance_criteria = [criterion("J01 the-known-server-token")];
  const box = sandbox({ board });
  mkdirSync(join(box.top, ".config/barkpark"), { recursive: true });
  writeFileSync(join(box.top, ".config/barkpark/config.json"), JSON.stringify({ known_servers: [{ token: "the-known-server-token" }] }));
  const r = box.run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /looks like a secret/);
});

test("drawing alone writes the pictures and leaves git and GitHub alone", () => {
  const box = sandbox();
  const base = box.head();
  const r = box.run("");
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(box.main, "docs/img/roadmap.svg"), "utf8"), /1 of 2 milestones done/);
  assert.equal(box.head(), base);
  assert.deepEqual(box.github().log, []);
});

test("only the date changing doesn't redraw", () => {
  const box = sandbox();
  assert.equal(box.run().status, 0);
  const path = join(box.main, "docs/img/roadmap.svg");
  writeFileSync(path, readFileSync(path, "utf8").replace(/As of \d{4}-\d{2}-\d{2}/, "As of 2000-01-01"));
  const r = box.run("");
  assert.match(r.stdout, /0 picture\(s\) changed/);
  assert.match(readFileSync(path, "utf8"), /As of 2000-01-01/);
});
