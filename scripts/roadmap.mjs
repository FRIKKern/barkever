#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildModel, readHeading, readJourneys, readPlan } from "./roadmap/model.mjs";
import { renderRoute } from "./roadmap/route.mjs";
import { renderJourneys } from "./roadmap/journeys.mjs";
import { syncGithub } from "./roadmap/github.mjs";

const GOAL = "task-42e5633d742184c5";
const ORIGIN = /[:/]FRIKKern\/barkever(\.git)?$/i;
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
  const before = Object.fromEntries(changed.map((path) => [path, previous(path)]));
  for (const path of changed) writeFileSync(`${root}${path}`, drawn[path]);
  return { changed, before };
}

const head = () => git("rev-parse", "HEAD");

function undoPictures(changed, before) {
  try { git("reset", "-q", "--", ...changed); } catch { console.error("roadmap: could not unstage the pictures"); }
  for (const path of changed) writeFileSync(`${root}${path}`, before[path]);
}

function commitAndPush({ changed, before }) {
  const base = head();
  let ours = null;
  try {
    git("add", ...changed);
    git("commit", "-qm", "Roadmap: redraw from the Barkpark board");
    ours = head();
    execFileSync("node", ["scripts/check-repo.mjs"], { cwd: root, stdio: "inherit" });
    execFileSync("node", ["scripts/scan-outgoing.mjs"], { cwd: root, stdio: "inherit" });
    git("push", "-q", "origin", "main");
  } catch (error) {
    if (ours === null) undoPictures(changed, before);
    else if (head() === ours) git("reset", "-q", "--keep", base);
    else console.error("roadmap: main moved past the picture commit; left it in place");
    throw error;
  }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === "EPERM"; }
}

function otherLandRunning() {
  const mark = resolve(root, git("rev-parse", "--git-common-dir"), "land.pid");
  if (!existsSync(mark)) return false;
  const pid = Number(readFileSync(mark, "utf8"));
  return pid !== process.ppid && isAlive(pid);
}

function publish() {
  if (!ORIGIN.test(git("remote", "get-url", "origin"))) { console.log("roadmap: origin is not FRIKKern/barkever; nothing to publish"); return; }
  if (git("symbolic-ref", "--short", "HEAD") !== "main") throw new Error("--publish runs on main");
  if (git("status", "--porcelain", "--untracked-files=no")) throw new Error("--publish needs a clean main");
  if (otherLandRunning()) throw new Error("another land is running; publish after it");
  git("fetch", "-q", "origin", "main");
  if (head() !== git("rev-parse", "origin/main")) throw new Error("main is not level with origin; land first");
  const model = readModel();
  const drawing = draw(model);
  if (drawing.changed.length) commitAndPush(drawing);
  console.log(`roadmap: ${drawing.changed.length} picture(s) pushed; GitHub ${JSON.stringify(syncGithub(model, { dryRun: false }))}`);
}

try {
  if (flags.has("--publish")) publish();
  else if (flags.has("--dry-run")) console.log(JSON.stringify(syncGithub(readModel(), { dryRun: true }), null, 2));
  else console.log(`roadmap: ${draw(readModel()).changed.length} picture(s) changed`);
} catch (error) {
  console.error(`roadmap: ${error.message}`);
  process.exit(1);
}
