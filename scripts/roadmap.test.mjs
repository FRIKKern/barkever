import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildModel, readHeading, readJourneys, readPlan } from "./roadmap/model.mjs";
import { renderRoute } from "./roadmap/route.mjs";
import { renderJourneys } from "./roadmap/journeys.mjs";
import { planIssues, planLabels, planMilestones, refuseSecrets, wantedIssues, wantedMilestones } from "./roadmap/github.mjs";

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const task = (title, lifecycle_status = "open") => ({ title, lifecycle_status });
const detail = (doc_id, lifecycle_status, criteria, children = []) => ({
  doc: { doc_id, lifecycle_status, content: { acceptance_criteria: criteria } },
  children,
});

const plan = [
  { id: "P0", name: "Ground", after: [], reward: "Rules" },
  { id: "P1", name: "Web", after: ["P0"], reward: "A <web> & app" },
  { id: "P2", name: "AI", after: ["P0"], reward: "Ask" },
  { id: "P3", name: "Later", after: ["P1", "P2"], reward: "More" },
];
const journeys = [
  { id: "J01", name: "Capture", rule: "Fast" },
  { id: "J02", name: "Browse", rule: "Back works" },
  { id: "J03", name: "Ask", rule: "Cites" },
];
const details = {
  P0: detail("task-a0", "done", [{ criterion: "Pushed", met: true, evidence: "ran" }, { criterion: "Unstamped", met: false }]),
  P1: detail("task-a1", "open", [{ criterion: "J01 Capture and J02 Browse pass", met: true, evidence: "ran" }], [task("Shell", "done"), task("Sidebar"), task("Dropped", "cancelled")]),
  P2: detail("task-a2", "open", [{ criterion: "J03 Ask passes", met: false }]),
  P3: detail("task-a3", "open", []),
};
const goal = {
  children: [
    task("P0 Ground"),
    task("J01: a lost key"),
    task("J03: a late citation", "done"),
    task("Heavy queue upkeep"),
    task("Old upkeep", "done"),
    task("Cancelled upkeep", "cancelled"),
  ],
};
const model = () => buildModel({ plan, heading: "all signed off", journeys, goal, details, specs: new Set(["J03"]), asOf: "2026-01-02" });
const milestone = (id) => model().milestones.find((m) => m.id === id);

test("the real ROADMAP table parses: P0 to P7 in order, and every After names a milestone", () => {
  const rows = readPlan(file("docs/ROADMAP.md"));
  assert.deepEqual(rows.map((r) => r.id), ["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7"]);
  const ids = new Set(rows.map((r) => r.id));
  for (const row of rows) for (const id of row.after) assert.ok(ids.has(id), `${row.id} after ${id}`);
  assert.deepEqual(rows[7].after, ["P4", "P6"]);
  assert.ok(rows.every((r) => r.reward.length > 0));
  assert.match(readHeading(file("docs/ROADMAP.md")), /signed off/);
});

test("the real JOURNEYS table parses to ten rows and keeps the first clause of each rule", () => {
  const rows = readJourneys(file("JOURNEYS.md"));
  assert.equal(rows.length, 10);
  assert.equal(rows[1].rule, "Sidebar → notebook → list → note");
  assert.doesNotMatch(rows[0].rule, /\.$/);
});

test("status follows the board: done, moving when anything closed or stamped, ahead when nothing has", () => {
  assert.equal(milestone("P0").status, "done");
  assert.equal(milestone("P1").status, "moving");
  assert.equal(milestone("P2").status, "moving");
  assert.equal(milestone("P3").status, "ahead");
  assert.equal(model().now, "P1");
});

test("a done milestone with unstamped criteria still shows the shortfall", () => {
  assert.equal(milestone("P0").met, 1);
  assert.equal(milestone("P0").criteria.length, 2);
});

test("tasks count live children plus loose tasks naming a journey the milestone owns; cancelled never counts", () => {
  assert.deepEqual([milestone("P1").tasksDone, milestone("P1").tasksTotal], [1, 3]);
  assert.deepEqual([milestone("P2").tasksDone, milestone("P2").tasksTotal], [1, 1]);
});

test("open upkeep counts loose open tasks with no journey, not done or cancelled ones", () => {
  assert.equal(model().upkeepOpen, 1);
});

test("a journey is signed only from a stamped criterion, tested from a spec, else missing; one criterion can sign two", () => {
  const [j1, j2, j3] = model().journeys;
  assert.equal(j1.status, "signed");
  assert.equal(j2.status, "signed");
  assert.equal(j3.status, "spec");
  const none = buildModel({ plan, heading: "", journeys, goal, details: { ...details, P2: detail("task-a2", "open", [{ criterion: "J03 Ask", met: false }]) }, specs: new Set(), asOf: "x" });
  assert.equal(none.journeys[2].status, "missing");
});

test("a journey no criterion names is never signed off", () => {
  const extra = [...journeys, { id: "J04", name: "Lone", rule: "r" }];
  const none = buildModel({ plan, heading: "", journeys: extra, goal, details, specs: new Set(), asOf: "x" });
  assert.equal(none.journeys[3].status, "missing");
  const spec = buildModel({ plan, heading: "", journeys: extra, goal, details, specs: new Set(["J04"]), asOf: "x" });
  assert.equal(spec.journeys[3].status, "spec");
});

test("a stamp alone moves a milestone, with no task closed", () => {
  const stampOnly = { ...details, P3: detail("task-a3", "open", [{ criterion: "Later", met: true, evidence: "ran" }]) };
  const row = buildModel({ plan, heading: "", journeys, goal, details: stampOnly, specs: new Set(), asOf: "x" });
  assert.equal(row.milestones[3].status, "moving");
});

test("a stamp with no evidence is not a sign-off", () => {
  const bare = { ...details, P1: detail("task-a1", "open", [{ criterion: "J01 and J02", met: true }]) };
  const row = buildModel({ plan, heading: "", journeys, goal, details: bare, specs: new Set(), asOf: "x" });
  assert.equal(row.journeys[0].status, "missing");
});

test("a journey named twice needs every stamp, and the first milestone owns it", () => {
  const twice = { ...details, P2: detail("task-a2", "open", [{ criterion: "J01 again", met: false }]) };
  const row = buildModel({ plan, heading: "", journeys, goal, details: twice, specs: new Set(), asOf: "x" });
  assert.equal(row.journeys[0].status, "missing");
  assert.equal(row.journeys[0].milestone, "P1");
});

test("a range names every journey in it", () => {
  const ranged = { ...details, P1: detail("task-a1", "open", [{ criterion: "J01 to J03 pass", met: true, evidence: "ran" }]), P2: detail("task-a2", "open", []) };
  const row = buildModel({ plan, heading: "", journeys, goal, details: ranged, specs: new Set(), asOf: "x" });
  assert.deepEqual(row.journeys.map((j) => j.status), ["signed", "signed", "signed"]);
});

test("a board reply without criteria, an empty plan or no journeys throws instead of drawing nothing", () => {
  const lost = { ...details, P2: { doc: { doc_id: "task-a2", lifecycle_status: "open", content: {} }, children: [] } };
  assert.throws(() => buildModel({ plan, heading: "", journeys, goal, details: lost, specs: new Set(), asOf: "x" }), /no acceptance criteria for P2/);
  assert.throws(() => buildModel({ plan: [], heading: "", journeys, goal, details, specs: new Set(), asOf: "x" }), /no milestone rows/);
  assert.throws(() => buildModel({ plan, heading: "", journeys: [], goal, details, specs: new Set(), asOf: "x" }), /no journey rows/);
});

test("a journey counts its open tasks, children and loose alike", () => {
  const [j1, , j3] = model().journeys;
  assert.equal(j1.openTasks, 1);
  assert.equal(j1.milestone, "P1");
  assert.equal(j3.openTasks, 0);
});

test("both pictures carry the two themes, escape text, say the counts and repeat exactly", () => {
  for (const render of [renderRoute, renderJourneys]) {
    const svg = render(model());
    assert.equal(svg, render(model()));
    assert.match(svg, /prefers-color-scheme: dark/);
    assert.match(svg, /prefers-reduced-motion/);
    assert.match(svg, /As of 2026-01-02/);
    assert.doesNotMatch(svg, /undefined|NaN/);
  }
  const route = renderRoute(model());
  assert.match(route, /A &lt;web&gt; &amp; app/);
  assert.match(route, /1 of 4 milestones done, 2 moving, 1 not started; 2 of 3 journeys signed off/);
  assert.match(renderJourneys(model()), /2 of 3 journeys signed off; 1 more have/);
  assert.match(route, />1 of 3 tasks</);
  assert.match(route, />NOW</);
  const [light, dark] = route.match(/--bg:#[0-9a-f]+/g);
  assert.notEqual(light, dark);
  assert.match(renderJourneys(model()), /e2e spec/);
});

test("stations in parallel get their own height, however many there are", () => {
  const three = ["P1", "P2", "P3"].map((id) => ({ id, name: id, after: ["P0"], reward: "r" }));
  const flat = [{ id: "P0", name: "P0", after: [], reward: "r" }, ...three];
  const open = Object.fromEntries(flat.map(({ id }) => [id, detail(id, "open", [])]));
  const svg = renderRoute(buildModel({ plan: flat, heading: "h", journeys, goal: { children: [] }, details: open, specs: new Set(), asOf: "x" }));
  const heights = three.map(({ id }) => svg.match(new RegExp(`y="(\\d+)"[^>]*>${id}</text>`))[1]);
  assert.equal(new Set(heights).size, 3);
});

test("milestones with no order at all still draw", () => {
  const flat = [{ id: "P0", name: "A", after: [], reward: "r" }, { id: "P1", name: "B", after: [], reward: "r" }];
  const open = Object.fromEntries(flat.map(({ id }) => [id, detail(id, "open", [])]));
  assert.doesNotMatch(renderRoute(buildModel({ plan: flat, heading: "h", journeys, goal: { children: [] }, details: open, specs: new Set(), asOf: "x" })), /NaN|Infinity/);
});

test("a milestone with no tasks draws an empty ring, not a broken one", () => {
  const svg = renderRoute(buildModel({ plan: [{ id: "P0", name: "A", after: [], reward: "r" }, { id: "P1", name: "B", after: ["P0"], reward: "r" }], heading: "h", journeys, goal: { children: [] }, details: { P0: detail("t", "open", [{ criterion: "c", met: true }]), P1: detail("u", "open", []) }, specs: new Set(), asOf: "x" }));
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

const wantMilestones = () => wantedMilestones(model());
const wantIssues = () => wantedIssues(model());
const numbers = { "P0 Ground": 1, "P1 Web": 2, "P2 AI": 3, "P3 Later": 4 };

const asExisting = (want) =>
  want.map((issue, i) => ({
    number: i + 10,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    ...(issue.state === "closed" && { state_reason: "completed" }),
    milestone: { number: numbers[issue.milestone] },
    labels: issue.labels.map((name) => ({ name })),
  }));

test("milestones: new ones are created, a done one is closed, a matching one is left alone", () => {
  const want = wantMilestones();
  assert.equal(want[0].state, "closed");
  assert.equal(want[1].state, "open");
  assert.match(want[1].description, /1 of 3 tasks done, 1 of 1 criteria stamped\. Barkpark: task-a1\./);
  const ops = planMilestones(want, [{ number: 7, ...want[0] }, { number: 8, ...want[1], state: "closed" }]);
  assert.deepEqual(ops.map((op) => [op.method, op.path]), [["PATCH", "milestones/8"], ["POST", "milestones"], ["POST", "milestones"]]);
  assert.ok(ops.filter((op) => op.method === "POST").every((op) => !("state" in op.fields)));
});

test("issues: one per criterion, closed when stamped, labelled with its journeys", () => {
  const want = wantIssues();
  assert.equal(want.length, 4);
  const web = want.find((issue) => issue.key === "task-a1:0");
  assert.equal(web.state, "closed");
  assert.deepEqual(web.labels, ["J01", "J02", "criterion"]);
  assert.equal(want.find((issue) => issue.key === "task-a2:0").state, "open");
});

test("a new stamped criterion is created, then closed; GitHub can't create it closed", () => {
  const ops = planIssues(wantIssues(), [], numbers);
  assert.equal(ops.length, 4);
  assert.ok(ops.every((op) => op.method === "POST" && !("state" in op.fields)));
  assert.deepEqual(ops.map((op) => Boolean(op.thenClose)), [true, false, true, false]);
  assert.equal(ops[0].fields.milestone, 1);
});

test("a second sync changes nothing", () => {
  const want = wantIssues();
  const settled = asExisting(want);
  assert.deepEqual(planIssues(want, settled, numbers), []);
});

test("a criterion stamped on the board closes its issue, and unstamping reopens it", () => {
  const want = wantIssues();
  const open = asExisting(want).map(({ state_reason, ...issue }) => ({ ...issue, state: "open" }));
  const closes = planIssues(want, open, numbers);
  assert.ok(closes.length > 0 && closes.every((op) => op.fields.state === "closed"));
  const allClosed = asExisting(want).map((issue) => ({ ...issue, state: "closed", state_reason: "completed" }));
  const reopens = planIssues(want, allClosed, numbers);
  assert.ok(reopens.length > 0 && reopens.every((op) => op.fields.state === "open"));
});

test("any drift in a mirror issue is put back", () => {
  const want = wantIssues();
  for (const drift of [{ title: "edited" }, { body: `${want[1].body} extra` }, { milestone: { number: 99 } }, { labels: [{ name: "bug" }] }]) {
    const have = asExisting(want).map((issue, i) => (i === 1 ? { ...issue, ...drift } : issue));
    assert.deepEqual(planIssues(want, have, numbers).map((op) => op.path), ["issues/11"]);
  }
});

test("a fix to an issue under a closed milestone leaves the milestone out, unless it changed", () => {
  const want = wantIssues();
  const edited = asExisting(want).map((issue, i) => (i === 0 ? { ...issue, title: "edited" } : issue));
  const [fix] = planIssues(want, edited, numbers);
  assert.ok(!("milestone" in fix.fields));
  const moved = asExisting(want).map((issue, i) => (i === 0 ? { ...issue, milestone: { number: 99 } } : issue));
  assert.equal(planIssues(want, moved, numbers)[0].fields.milestone, 1);
});

test("a milestone whose description drifted is put back", () => {
  const want = wantMilestones();
  const have = want.map((m, i) => ({ number: i + 1, ...m, description: i === 1 ? "edited" : m.description }));
  assert.deepEqual(planMilestones(want, have).map((op) => op.path), ["milestones/2"]);
});

test("a stamped issue closed as not planned is corrected to completed", () => {
  const want = wantIssues();
  const have = asExisting(want).map((issue) => (issue.state === "closed" ? { ...issue, state_reason: "not_planned" } : issue));
  const ops = planIssues(want, have, numbers);
  assert.ok(ops.length > 0 && ops.every((op) => op.fields.state_reason === "completed"));
  assert.deepEqual(planIssues(want, asExisting(want), numbers), []);
});

test("a second issue with the same marker closes as not planned", () => {
  const want = wantIssues();
  const have = asExisting(want);
  const copy = { ...have[1], number: 50 };
  assert.deepEqual(planIssues(want, [copy, ...have], numbers), [{ method: "PATCH", path: "issues/50", fields: { state: "closed", state_reason: "not_planned" } }]);
});

test("more than three issues leaving the board at once is refused", () => {
  const gone = (n) => ({ number: n, title: "old", body: `<!-- barkever:task-a9:${n} -->`, state: "open", labels: [], milestone: null });
  const want = wantIssues();
  const have = asExisting(want);
  assert.equal(planIssues(want, [...have, gone(61), gone(62), gone(63)], numbers).length, 3);
  assert.throws(() => planIssues(want, [...have, gone(61), gone(62), gone(63), gone(64)], numbers), /refusing to close 4/);
});

test("the title is capped at what GitHub takes", () => {
  const long = { ...details, P2: detail("task-a2", "open", [{ criterion: "x".repeat(400), met: false }]) };
  const issues = wantedIssues(buildModel({ plan, heading: "", journeys, goal, details: long, specs: new Set(), asOf: "x" }));
  assert.ok(issues.every((issue) => issue.title.length <= 240));
});

test("issues without our marker are never touched; ours that left the board close as not planned, once", () => {
  const want = wantIssues();
  const stranger = { number: 99, title: "A person wrote this", body: "hello", state: "open", labels: [], milestone: null };
  const gone = { number: 98, title: "old", body: "<!-- barkever:task-a9:0 -->", state: "open", labels: [], milestone: null };
  const goneClosed = { ...gone, number: 97, body: "<!-- barkever:task-a9:1 -->", state: "closed" };
  const settled = asExisting(want);
  const ops = planIssues(want, [...settled, stranger, gone, goneClosed], numbers);
  assert.deepEqual(ops, [{ method: "PATCH", path: "issues/98", fields: { state: "closed", state_reason: "not_planned" } }]);
});

test("labels: only the missing ones are made", () => {
  const ops = planLabels(wantIssues(), ["J01", "bug"]);
  assert.deepEqual(ops.map((op) => op.fields.name), ["J02", "J03", "criterion"]);
});

test("text that looks like a secret or an email never leaves", () => {
  const samples = [
    "ask someone@example.com",
    `key ${"gh" + "p_"}${"a".repeat(36)}`,
    `k ${"sk-" + "ant-"}${"b".repeat(24)}`,
    `k ${"sk-" + "proj-"}${"b".repeat(24)}`,
    `k ${"github" + "_pat_"}${"c".repeat(24)}`,
    `k ${"bp" + "sess_"}${"d".repeat(20)}`,
    `k ${"AK" + "IA"}${"E".repeat(16)}`,
    `k ${"np" + "m_"}${"f".repeat(36)}`,
  ];
  for (const title of samples) {
    assert.throws(() => refuseSecrets([{ method: "POST", path: "issues", fields: { title } }], []), /looks like a secret/);
  }
  assert.throws(() => refuseSecrets([{ method: "POST", path: "issues", fields: { title: "the shared phrase" } }], ["shared phrase"]), /looks like a secret/);
  assert.doesNotThrow(() => refuseSecrets([{ method: "POST", path: "issues", fields: { title: "J01 Capture passes", milestone: 1 } }], ["shared phrase"]));
  assert.throws(() => refuseSecrets([{ method: "POST", path: "issues", fields: { title: "ok", body: "mail me@example.com" } }], []));
});
