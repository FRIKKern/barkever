import { execFileSync } from "node:child_process";

export const REPO = "FRIKKern/barkever";
const SECRET_LIKE = /sk-ant-|sk-proj-|\bgh[opsur]_[A-Za-z0-9]{20,}|github_pat_|[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const MARKER = /<!-- barkever:(task-[0-9a-f]+:\d+) -->/;
const LABEL_COLORS = { criterion: "3a62b5", journey: "4f8f62" };

export const wantedMilestones = (model) =>
  model.milestones.map((m) => ({
    title: `${m.id} ${m.name}`,
    description: `${m.reward}. ${m.tasksDone} of ${m.tasksTotal} tasks done, ${m.met} of ${m.criteria.length} criteria stamped. Barkpark: ${m.task}.`,
    state: m.status === "done" ? "closed" : "open",
  }));

export const wantedIssues = (model) =>
  model.milestones.flatMap((m) =>
    m.criteria.map((c) => {
      const key = `${m.task}:${c.index}`;
      return {
        key,
        title: `${m.id}: ${c.text}`.slice(0, 240),
        body: `Mirror of one acceptance criterion on Barkpark task \`${m.task}\`. Barkpark is the source and this issue follows it (docs/decisions/0037). Stamp it there.\n\n<!-- barkever:${key} -->`,
        milestone: `${m.id} ${m.name}`,
        state: c.met ? "closed" : "open",
        labels: ["criterion", ...c.journeys].sort(),
      };
    }),
  );

export function planMilestones(want, have) {
  const byTitle = new Map(have.map((m) => [m.title, m]));
  const ops = [];
  for (const m of want) {
    const found = byTitle.get(m.title);
    if (!found) ops.push({ method: "POST", path: "milestones", fields: m });
    else if (found.description !== m.description || found.state !== m.state) ops.push({ method: "PATCH", path: `milestones/${found.number}`, fields: m });
  }
  return ops;
}

const sameLabels = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export function planIssues(want, have, numbers) {
  const byKey = new Map();
  for (const issue of have) {
    const key = issue.body?.match(MARKER)?.[1];
    if (key) byKey.set(key, issue);
  }
  const ops = [];
  for (const issue of want) {
    const fields = {
      title: issue.title,
      body: issue.body,
      milestone: numbers[issue.milestone],
      state: issue.state,
      labels: issue.labels,
    };
    const found = byKey.get(issue.key);
    byKey.delete(issue.key);
    if (!found) {
      const { state, ...create } = fields;
      ops.push({ method: "POST", path: "issues", fields: create, thenClose: state === "closed" });
      continue;
    }
    const same =
      found.title === fields.title &&
      found.body === fields.body &&
      found.state === fields.state &&
      found.milestone?.number === fields.milestone &&
      sameLabels(found.labels.map((l) => l.name), fields.labels);
    if (!same) ops.push({ method: "PATCH", path: `issues/${found.number}`, fields });
  }
  for (const orphan of byKey.values()) {
    if (orphan.state === "open") ops.push({ method: "PATCH", path: `issues/${orphan.number}`, fields: { state: "closed", state_reason: "not_planned" } });
  }
  return ops;
}

export function planLabels(want, haveNames) {
  const have = new Set(haveNames);
  const names = [...new Set(want.flatMap((issue) => issue.labels))].sort();
  return names
    .filter((name) => !have.has(name))
    .map((name) => ({ method: "POST", path: "labels", fields: { name, color: LABEL_COLORS[name] ?? LABEL_COLORS.journey } }));
}

export function refuseSecrets(ops) {
  for (const op of ops) {
    const hit = Object.values(op.fields).find((value) => typeof value === "string" && SECRET_LIKE.test(value));
    if (hit !== undefined) throw new Error(`refusing to send text that looks like a secret or an email, on ${op.method} ${op.path}`);
  }
}

const list = (path) =>
  execFileSync("gh", ["api", "--paginate", `repos/${REPO}/${path}`, "--jq", ".[]"], { encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const send = ({ method, path, fields }) =>
  JSON.parse(execFileSync("gh", ["api", "-X", method, `repos/${REPO}/${path}`, "--input", "-"], { input: JSON.stringify(fields), encoding: "utf8", maxBuffer: 1 << 26 }));

const run = (ops) => {
  refuseSecrets(ops);
  for (const op of ops) {
    const made = send(op);
    if (op.thenClose) send({ method: "PATCH", path: `issues/${made.number}`, fields: { state: "closed" } });
  }
};

const milestoneNumbers = () => Object.fromEntries(list("milestones?state=all&per_page=100").map((m) => [m.title, m.number]));
const liveIssues = () => list("issues?state=all&per_page=100").filter((issue) => !issue.pull_request);

export function syncGithub(model, { dryRun }) {
  const milestones = wantedMilestones(model);
  const issues = wantedIssues(model);
  const labelOps = planLabels(issues, list("labels?per_page=100").map((l) => l.name));
  const milestoneOps = planMilestones(milestones, list("milestones?state=all&per_page=100"));
  if (dryRun) {
    const issueOps = planIssues(issues, liveIssues(), milestoneNumbers());
    refuseSecrets([...labelOps, ...milestoneOps, ...issueOps]);
    return { labels: labelOps.length, milestones: milestoneOps.length, issues: issueOps.length, titles: issueOps.map((op) => op.fields.title ?? op.path) };
  }
  run(labelOps);
  run(milestoneOps);
  const issueOps = planIssues(issues, liveIssues(), milestoneNumbers());
  run(issueOps);
  return { labels: labelOps.length, milestones: milestoneOps.length, issues: issueOps.length };
}
