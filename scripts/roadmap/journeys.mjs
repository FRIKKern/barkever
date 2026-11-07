import { count, say, svgDoc, wrap, oneLine } from "./kit.mjs";

const WIDTH = 1200;
const NAME_CHAR_WIDTH = 11.5;
const PAD = 48;
const COLUMNS = 5;
const GAP = 14;
const CARD_H = 196;
const TOP = 150;

const look = {
  signed: { mark: "✓", label: "signed off", cls: "okt" },
  spec: { mark: "◆", label: "e2e spec", cls: "nowt" },
  missing: { mark: "○", label: "no e2e", cls: "soft" },
};

const tasksLabel = (n) => (n === 0 ? "no open tasks" : n === 1 ? "1 open task" : `${n} open tasks`);

function card(j, x, y, width) {
  const { mark, label, cls } = look[j.status];
  const lines = wrap(j.rule, Math.floor((width - 36) / 7.7), 4);
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${CARD_H}" rx="12" class="card"/>`,
    `<rect x="${x}" y="${y}" width="${width}" height="6" rx="3" class="${j.status === "signed" ? "okf" : j.status === "spec" ? "nowf" : "track"}"/>`,
    say(x + 18, y + 36, j.id, { cls: "caps soft" }),
    say(x + width - 18, y + 36, `${mark} ${label}`, { size: 14, weight: 600, cls, anchor: "end" }),
    say(x + 18, y + 66, oneLine(j.name, Math.floor((width - 36) / NAME_CHAR_WIDTH)), { size: 21, weight: 600 }),
    ...lines.map((line, i) => say(x + 18, y + 92 + i * 19, line, { size: 14.5, cls: "soft" })),
    say(x + 18, y + CARD_H - 16, `${j.milestone} · ${tasksLabel(j.openTasks)}`, { size: 14, cls: "soft" }),
  ];
}

export function renderJourneys(model) {
  const { journeys } = model;
  const signed = journeys.filter((j) => j.status === "signed").length;
  const withSpec = journeys.filter((j) => j.status === "spec").length;
  const width = (WIDTH - 2 * PAD - (COLUMNS - 1) * GAP) / COLUMNS;
  const rows = Math.ceil(journeys.length / COLUMNS);
  const height = TOP + rows * (CARD_H + GAP) + 44;
  return svgDoc({
    width: WIDTH,
    height,
    title: "Barkever journeys",
    desc: `${signed} of ${journeys.length} journeys signed off; ${withSpec} more have an end-to-end spec but no sign-off.`,
    body: [
      say(PAD, 74, "The journeys", { size: 42, weight: 700 }),
      say(PAD, 106, "What the app has to do. A journey counts when its stamp on the board has evidence.", { size: 19, cls: "soft" }),
      count(signed, journeys.length, WIDTH - PAD, 74, "signed off"),
      ...journeys.flatMap((j, i) =>
        card(j, PAD + (i % COLUMNS) * (width + GAP), TOP + Math.floor(i / COLUMNS) * (CARD_H + GAP), width),
      ),
      say(PAD, height - 20, `As of ${model.asOf}. Signed off is read from the Barkpark board. An e2e spec on main proves no pass by itself.`, { size: 14, cls: "soft" }),
    ],
  });
}
