const tableRows = (md, idPattern) =>
  md.split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter(([id]) => idPattern.test(id));

export const readPlan = (md) =>
  tableRows(md, /^P\d$/).map(([id, name, after, reward]) => ({
    id,
    name,
    after: after.split(",").map((s) => s.trim()).filter(Boolean),
    reward,
  }));

export const readHeading = (md) => md.match(/^Heading to: (.+)$/m)?.[1] ?? "";

export const readJourneys = (md) =>
  tableRows(md, /^J\d\d$/).map(([id, name, rule]) => ({ id, name, rule: rule.split(/(?<=\.)\s|;\s/)[0].replace(/\.$/, "") }));

const journeysIn = (text) => [...new Set(text.match(/\bJ\d\d\b/g) ?? [])];
const isLive = (task) => task.lifecycle_status !== "cancelled";
const isDone = (task) => task.lifecycle_status === "done";
const isMilestone = (task) => /^P\d /.test(task.title);

export function buildModel({ plan, heading, journeys, goal, details, specs, asOf }) {
  const owner = new Map();
  const criteriaOf = (id) => details[id]?.doc.content?.acceptance_criteria ?? [];
  for (const { id } of plan) {
    for (const { criterion } of criteriaOf(id)) for (const j of journeysIn(criterion)) owner.set(j, id);
  }
  const loose = goal.children.filter((task) => isLive(task) && !isMilestone(task));
  const ownerOfLoose = (task) => journeysIn(task.title).map((j) => owner.get(j)).find(Boolean);

  const milestones = plan.map((row) => {
    const detail = details[row.id];
    const tasks = [...detail.children.filter(isLive), ...loose.filter((task) => ownerOfLoose(task) === row.id)];
    const criteria = criteriaOf(row.id).map(({ criterion, met }, index) => ({
      index,
      text: criterion,
      met: Boolean(met),
      journeys: journeysIn(criterion),
    }));
    const tasksDone = tasks.filter(isDone).length;
    const met = criteria.filter((c) => c.met).length;
    const status = detail.doc.lifecycle_status === "done" ? "done" : tasksDone + met > 0 ? "moving" : "ahead";
    return { ...row, task: detail.doc.doc_id, status, criteria, met, tasksDone, tasksTotal: tasks.length };
  });

  const allTasks = [...plan.flatMap(({ id }) => details[id].children.filter(isLive)), ...loose];
  const journeyRows = journeys.map((j) => {
    const criterion = milestones.flatMap((m) => m.criteria).find((c) => c.journeys.includes(j.id));
    const status = criterion?.met ? "signed" : specs.has(j.id) ? "tested" : "missing";
    const openTasks = allTasks.filter((task) => !isDone(task) && journeysIn(task.title).includes(j.id)).length;
    return { ...j, status, openTasks, milestone: owner.get(j.id) ?? "" };
  });

  return {
    asOf,
    heading,
    milestones,
    now: milestones.find((m) => m.status === "moving")?.id ?? "",
    journeys: journeyRows,
    upkeepOpen: loose.filter((task) => !isDone(task) && !ownerOfLoose(task)).length,
  };
}
