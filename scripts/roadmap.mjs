#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildModel, readHeading, readJourneys, readPlan } from "./roadmap/model.mjs";
import { renderRoute } from "./roadmap/route.mjs";
import { renderJourneys } from "./roadmap/journeys.mjs";
import { REPO, syncGithub } from "./roadmap/github.mjs";

const GOAL = "task-42e5633d742184c5";
const PICTURES = ["docs/img/roadmap.svg", "docs/img/journeys.svg"];
const root = new URL("..", import.meta.url).pathname;
const flags = new Set(process.argv.slice(2));
const text = (path) => readFileSync(`${root}${path}`, "utf8");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const task = (id) => JSON.parse(execFileSync("bp", ["task", "get", id, "-o", "json"], { encoding: "utf8", maxBuffer: 1 << 28, timeout: 30_000, stdio: ["ignore", "pipe", "ignore"] }));

const e2eSpecs = () => {
  const specs = new Set(readdirSync(`${root}app/e2e`).flatMap((f) => f.match(/^j(\d\d)-.*\.spec\.ts$/)?.[1] ?? []).map((n) => `J${n}`));
  if (readdirSync(`${root}mac/e2e`).includes("mac.spec.ts")) specs.add("J09");
  return specs;
};

function readModel() {
  const roadmap = text("docs/ROADMAP.md");
  const goal = task(GOAL);
  const plan = readPlan(roadmap);
  const details = {};
  for (const { id } of plan) {
    const row = goal.children.find((child) => child.title.startsWith(`${id} `));
    if (!row) throw new Error(`no ${id} under ${GOAL}`);
    details[id] = task(row.doc_id);
  }
  return buildModel({
    plan,
    heading: readHeading(roadmap),
    journeys: readJourneys(text("JOURNEYS.md")),
    goal,
    details,
    specs: e2eSpecs(),
    asOf: new Date().toISOString().slice(0, 10),
  });
}

const withoutDate = (svg) => svg.replace(/As of \d{4}-\d{2}-\d{2}/g, "");
const previous = (path) => { try { return text(path); } catch { return ""; } };

function draw(model) {
  const drawn = { [PICTURES[0]]: renderRoute(model), [PICTURES[1]]: renderJourneys(model) };
  const changed = PICTURES.filter((path) => withoutDate(previous(path)) !== withoutDate(drawn[path]));
  for (const path of changed) writeFileSync(`${root}${path}`, drawn[path]);
  return changed;
}

function commitAndPush(changed) {
  git("add", ...changed);
  git("commit", "-qm", "Roadmap: redraw from the Barkpark board");
  try {
    execFileSync("node", ["scripts/check-repo.mjs"], { cwd: root, stdio: "inherit" });
    execFileSync("node", ["scripts/scan-outgoing.mjs"], { cwd: root, stdio: "inherit" });
    git("push", "-q", "origin", "main");
  } catch (error) {
    git("reset", "-q", "--keep", "HEAD~1");
    throw error;
  }
}

function publish() {
  if (!git("remote", "get-url", "origin").includes(REPO)) { console.log(`roadmap: origin is not ${REPO}; nothing to publish`); return; }
  if (git("symbolic-ref", "--short", "HEAD") !== "main") throw new Error("--publish runs on main");
  if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("--publish needs a clean main");
  const model = readModel();
  const changed = draw(model);
  if (changed.length) commitAndPush(changed);
  console.log(`roadmap: ${changed.length} picture(s) pushed; GitHub ${JSON.stringify(syncGithub(model, { dryRun: false }))}`);
}

if (flags.has("--publish")) publish();
else {
  const model = readModel();
  console.log(`roadmap: ${draw(model).length} picture(s) changed`);
  if (flags.has("--dry-run")) console.log(JSON.stringify(syncGithub(model, { dryRun: true }), null, 2));
}
