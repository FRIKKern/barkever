import { diagrams } from "./diagrams.mjs";

const tasks = {
  "fx-note-00": [["Agree goals with the client", 1], ["Draft the sitemap", 1], ["Book the design review", 0], ["Share the timeline", 0]],
  "fx-note-03": [["List every page", 1], ["Assign page owners", 1], ["Move copy into the CMS", 0]],
  "fx-note-08": [["Shout test the shortlist", 1], ["Check domains", 0], ["Book the naming meeting", 0]],
  "fx-note-11": [["Send shortlist to Quarry", 1], ["Start the Lighthouse sprint", 1], ["Post notes in chat", 1]],
  "fx-note-16": [["Write the Lighthouse ownership note", 0], ["Ask about the conference budget", 0]],
  "fx-note-19": [["Laptop and accounts", 1], ["Coffee with the team", 1], ["Read the handbook", 1], ["Ship a small change", 0], ["Write a first decision", 0]],
  "fx-note-25": [["Call the clinic", 0]],
  "fx-note-28": [["Deep work: Harbor copy", 1], ["Call Kari", 1], ["Evening walk", 0]],
  "fx-note-29": [["Bread", 1], ["Leeks", 0], ["Carrots", 0], ["Cream", 0], ["Fresh fish", 0], ["Coffee", 1]],
  "fx-note-30": [["Plant tulips", 1], ["Rake the leaves", 1], ["Cover the roses", 0]],
  "fx-note-34": [["Top shelf", 1], ["Spice drawer", 1], ["Pantry", 1], ["Under the sink", 0]],
  "fx-note-35": [["Book the tyre change", 1], ["Check the brake fluid", 0], ["Wash the car", 0]],
  "fx-note-43": [["Train tickets", 1], ["Book the hotel", 1], ["Fish market list", 0]],
  "fx-note-45": [["Charger", 1], ["Passport", 0], ["Wool sweater", 0], ["Rain jacket", 0]],
};

const headings = {
  "fx-note-00": [null, ["fx-note-00-t", "Next steps"]],
  "fx-note-17": ["Bets", ["fx-note-17-p1", "Not now"]],
  "fx-note-18": ["How we work", ["fx-note-18-b", "Rules"]],
  "fx-note-19": ["Day one", ["fx-note-19-t", "Week one"]],
  "fx-note-43": ["Plan", ["fx-note-43-t", "Before we go"]],
};

const recent = ["fx-note-00", "fx-note-29", "fx-note-02", "fx-note-17", "fx-note-28", "fx-note-11", "fx-note-07", "fx-note-01"];
const recentHours = [0.3, 1.2, 3, 5, 7, 26, 30, 50];
const now = Date.UTC(2026, 9, 29, 9, 30);

const heading = (id, text) => ({ id, type: "heading", level: 2, text });

export function applyOverlay(note, index) {
  const blocks = note.body.blocks;
  if (tasks[note._id]) {
    blocks.find((b) => b.task).items = tasks[note._id].map(([value, checked]) => ({ content: [{ type: "text", value }], checked: !!checked }));
  }
  if (headings[note._id]) {
    const [first, [before, text]] = headings[note._id];
    blocks.splice(blocks.findIndex((b) => b.id === before), 0, heading(`${note._id}-h1`, text));
    if (first) blocks.unshift(heading(`${note._id}-h0`, first));
  }
  const img = diagrams[note._id];
  if (img) {
    const { after, ...block } = img;
    blocks.splice(blocks.findIndex((b) => b.id === after) + 1, 0, { id: `${note._id}-img`, type: "image", ...block });
  }
  const r = recent.indexOf(note._id);
  const hours = r >= 0 ? recentHours[r] : 60 + ((index * 37) % 640);
  note.updatedAt = new Date(now - hours * 3600e3).toISOString();
}
