import { count, say, svgDoc, wrap } from "./kit.mjs";

const WIDTH = 1200;
const PAD = 48;
const ROUTE_TOP = 150;
const ROUTE_MID = 250;
const ROUTE_SPREAD = 56;
const RADIUS = 24;
const LISTS_TOP = 396;

function placeStations(milestones) {
  const depth = {};
  const depthOf = (m) => (depth[m.id] ??= m.after.length ? 1 + Math.max(...m.after.map((id) => depthOf(milestones.find((o) => o.id === id)))) : 0);
  milestones.forEach(depthOf);
  const deepest = Math.max(...Object.values(depth));
  const step = (WIDTH - 2 * PAD - 2 * RADIUS - 40) / deepest;
  const at = {};
  for (const m of milestones) {
    const peers = milestones.filter((o) => depth[o.id] === depth[m.id]);
    const row = peers.indexOf(m);
    const y = peers.length === 1 ? ROUTE_MID : ROUTE_MID + (row === 0 ? -ROUTE_SPREAD : ROUTE_SPREAD);
    at[m.id] = { x: PAD + RADIUS + 20 + depth[m.id] * step, y };
  }
  return at;
}

const railClass = { done: "okl", moving: "nowl", ahead: "faintl" };

function rail(from, to, status) {
  const mid = (from.x + to.x) / 2;
  return `<path d="M${from.x} ${from.y}C${mid} ${from.y} ${mid} ${to.y} ${to.x} ${to.y}" class="${railClass[status]}" stroke-width="5"/>`;
}

function station(m, { x, y }, isNow) {
  const out = [];
  if (isNow) out.push(`<circle cx="${x}" cy="${y}" r="${RADIUS + 14}" class="pulse"/>`);
  if (m.status === "done") {
    out.push(`<circle cx="${x}" cy="${y}" r="${RADIUS}" class="okf"/>`, say(x, y + 6, m.id, { size: 17, weight: 700, cls: "ont", anchor: "middle" }));
  } else if (m.status === "moving") {
    const round = 2 * Math.PI * RADIUS;
    const part = (round * m.tasksDone) / Math.max(1, m.tasksTotal);
    out.push(
      `<circle cx="${x}" cy="${y}" r="${RADIUS}" class="card"/>`,
      `<circle cx="${x}" cy="${y}" r="${RADIUS}" fill="none" class="line" stroke-width="6"/>`,
      `<circle cx="${x}" cy="${y}" r="${RADIUS}" fill="none" class="nowl" stroke-width="6" stroke-dasharray="${part.toFixed(1)} ${round.toFixed(1)}" transform="rotate(-90 ${x} ${y})"/>`,
      say(x, y + 6, m.id, { size: 17, weight: 700, anchor: "middle" }),
    );
  } else {
    out.push(`<circle cx="${x}" cy="${y}" r="${RADIUS}" class="bg"/>`, `<circle cx="${x}" cy="${y}" r="${RADIUS}" class="faintl" stroke-width="3"/>`, say(x, y + 6, m.id, { size: 17, weight: 700, cls: "soft", anchor: "middle" }));
  }
  out.push(say(x, y + RADIUS + 24, m.name, { size: 16, weight: 600, anchor: "middle", cls: m.status === "ahead" ? "soft" : "" }));
  if (isNow) out.push(say(x, y - RADIUS - 16, "NOW", { size: 13, weight: 700, cls: "nowt", anchor: "middle" }));
  return out;
}

function header(x, y, width, label, cls, n) {
  return [
    say(x, y, label, { cls: `caps ${cls}` }),
    say(x + width, y, n, { cls: "caps soft", anchor: "end" }),
    `<path d="M${x} ${y + 12}H${x + width}" class="line"/>`,
  ];
}

const CHAR_WIDTH = 8;
const ROW_GAP = 36;
const fit = (text, width, maxLines) => wrap(text, Math.floor(width / CHAR_WIDTH), maxLines);
const stamped = (m) => `${m.met} of ${m.criteria.length} criteria stamped`;
const rewardLines = (lines, x, y) => lines.map((line, i) => say(x, y + 24 + i * 21, line, { cls: "soft" }));

function doneRow(m, x, y, width) {
  const lines = fit(m.reward, width, 2);
  return {
    height: 24 + lines.length * 21 + ROW_GAP,
    body: [
      say(x, y, `✓ ${m.id} ${m.name}`, { size: 19, weight: 600 }),
      ...rewardLines(lines, x, y),
      say(x, y + 24 + lines.length * 21, stamped(m), { size: 14, cls: "soft" }),
    ],
  };
}

function movingRow(m, x, y, width) {
  const lines = fit(m.reward, width, 2);
  const barY = y + 18 + lines.length * 21;
  const filled = (width * m.tasksDone) / Math.max(1, m.tasksTotal);
  return {
    height: 44 + lines.length * 21 + ROW_GAP,
    body: [
      say(x, y, `${m.id} ${m.name}`, { size: 19, weight: 600 }),
      say(x + width, y, `${m.tasksDone} of ${m.tasksTotal} tasks`, { size: 15, weight: 600, anchor: "end" }),
      ...rewardLines(lines, x, y),
      `<rect x="${x}" y="${barY}" width="${width}" height="7" rx="3.5" class="track"/>`,
      `<rect x="${x}" y="${barY}" width="${filled.toFixed(1)}" height="7" rx="3.5" class="nowf"/>`,
      say(x, barY + 26, stamped(m), { size: 14, cls: "soft" }),
    ],
  };
}

function aheadRow(m, x, y, width) {
  const lines = fit(m.reward, width, 3);
  return {
    height: lines.length * 21 + ROW_GAP,
    body: [say(x, y, `${m.id} ${m.name}`, { size: 19, weight: 600 }), ...rewardLines(lines, x, y)],
  };
}

function headingBox(text, x, y, width) {
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  const lines = wrap(sentence, Math.floor((width - 36) / 8.2), 7);
  const height = 62 + lines.length * 23;
  return {
    height,
    body: [
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" class="nowbg"/>`,
      say(x + 18, y + 32, "WHERE WE'RE HEADING", { cls: "caps nowt" }),
      ...lines.map((line, i) => say(x + 18, y + 62 + i * 23, line, { size: 17 })),
    ],
  };
}

function stack(milestones, draw, x, top, width) {
  let y = top;
  const body = [];
  for (const m of milestones) {
    const row = draw(m, x, y, width);
    body.push(...row.body);
    y += row.height;
  }
  return { body, end: y };
}

export function renderRoute(model) {
  const { milestones } = model;
  const at = placeStations(milestones);
  const done = milestones.filter((m) => m.status === "done");
  const moving = milestones.filter((m) => m.status === "moving");
  const ahead = milestones.filter((m) => m.status === "ahead");
  const signed = model.journeys.filter((j) => j.status === "signed").length;

  const rails = milestones.flatMap((m) => m.after.map((id) => rail(at[id], at[m.id], m.status)));
  const stations = milestones.flatMap((m) => station(m, at[m.id], m.id === model.now));

  const gap = 32;
  const doneW = 290;
  const aheadW = 290;
  const movingW = WIDTH - 2 * PAD - doneW - aheadW - 2 * gap;
  const movingX = PAD + doneW + gap;
  const aheadX = movingX + movingW + gap;
  const rowsTop = LISTS_TOP + 44;
  const doneList = stack(done, doneRow, PAD, rowsTop, doneW);
  const movingList = stack(moving, movingRow, movingX, rowsTop, movingW);
  const aheadList = stack(ahead, aheadRow, aheadX, rowsTop, aheadW);
  const box = headingBox(model.heading, aheadX, aheadList.end, aheadW);
  const lists = [
    ...header(PAD, LISTS_TOP, doneW, "DONE", "okt", `${done.length}`),
    ...doneList.body,
    ...header(movingX, LISTS_TOP, movingW, "NOT DONE YET · MOVING", "nowt", `${moving.length}`),
    ...movingList.body,
    ...header(aheadX, LISTS_TOP, aheadW, "NOT STARTED", "soft", `${ahead.length}`),
    ...aheadList.body,
    ...box.body,
  ];
  const height = Math.max(doneList.end, movingList.end, aheadList.end + box.height + ROW_GAP) + 34;

  return svgDoc({
    width: WIDTH,
    height,
    title: "Barkever roadmap",
    desc: `${done.length} of ${milestones.length} milestones done, ${moving.length} moving, ${ahead.length} not started; ${signed} of ${model.journeys.length} journeys signed off.`,
    body: [
      say(PAD, 74, "Barkever", { size: 42, weight: 700 }),
      say(PAD, 106, "Where the work stands. Drawn from the Barkpark board.", { size: 19, cls: "soft" }),
      count(done.length, milestones.length, WIDTH - PAD - 250, 74, "milestones done"),
      count(signed, model.journeys.length, WIDTH - PAD, 74, "journeys signed off"),
      ...rails,
      ...stations,
      ...lists,
      say(PAD, height - 20, `As of ${model.asOf}. A ring fills as tasks close. Plus ${model.upkeepOpen} open upkeep tasks not tied to a milestone.`, { size: 14, cls: "soft" }),
    ],
  });
}
