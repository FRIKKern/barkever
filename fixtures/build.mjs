#!/usr/bin/env node
// Builds fixtures/notes.ndjson: synthetic notebooks + notes. Deterministic, no network.
// Every id starts with "fx-"; every person, company and place is made up.
import { writeFileSync } from "node:fs";

const text = (value) => ({ type: "text", value });
const para = (id, ...content) => ({ id, type: "paragraph", content });
const heading = (id, level, value) => ({ id, type: "heading", level, text: value });
const bullets = (id, items) => ({ id, type: "list", ordered: false, items: items.map((v) => [text(v)]) });
const checklist = (id, items) => ({ id, type: "list", ordered: false, task: true, items: items.map(([v, checked]) => ({ content: [text(v)], checked })) });
const wikilink = (docId, label) => ({ type: "wikilink", target: docId, docId, children: [text(label)] });

const notebooks = [
  { _id: "fx-nb-inbox", name: "Inbox" },
  { _id: "fx-nb-work", name: "Work" },
  { _id: "fx-nb-projects", name: "Projects", parent: "fx-nb-work" },
  { _id: "fx-nb-meetings", name: "Meetings", parent: "fx-nb-work" },
  { _id: "fx-nb-home", name: "Home" },
  { _id: "fx-nb-reading", name: "Reading" },
  { _id: "fx-nb-travel", name: "Travel" },
];

// [notebook, title, tags, paragraphs, extra]
const seeds = [
  ["projects", "Harbor redesign: kickoff", ["harbor", "kickoff"], ["Goals for the Harbor site redesign: faster pages, calmer navigation, one clear call to action.", "Owner: Ola Testesen. Deadline end of quarter."], "tasks"],
  ["projects", "Harbor redesign: sitemap", ["harbor", "ia"], ["Top level: Home, Services, Work, About, Contact. Services splits into three.", "Open question: does Work need filters?"], "link:0"],
  ["projects", "Harbor redesign: wireframes", ["harbor", "design"], ["Three wireframe rounds. Round two dropped the carousel.", "Mobile first, then desktop."], "link:1"],
  ["projects", "Harbor redesign: content plan", ["harbor", "content"], ["Every page gets one owner and one deadline.", "Copy lives in the CMS from day one."], "tasks"],
  ["projects", "Lighthouse app: brief", ["lighthouse", "brief"], ["A small app that reminds field crews of safety checks.", "Works offline; syncs at the depot."], "link:0"],
  ["projects", "Lighthouse app: risks", ["lighthouse", "risk"], ["Biggest risk: crews ignore notifications.", "Second: battery drain from location checks."], "bullets"],
  ["projects", "Lighthouse app: estimate", ["lighthouse", "estimate"], ["Rough estimate: six weeks for two people.", "Excludes the admin dashboard."], "link:4"],
  ["projects", "Quarry rebrand: moodboard", ["quarry", "design"], ["Stone greys, one warm accent, a lot of white space.", "Typeface shortlist: three grotesks."], null],
  ["projects", "Quarry rebrand: naming", ["quarry", "naming"], ["Twelve candidates, three survived the shout test.", "Check domains before the next meeting."], "tasks"],
  ["projects", "Quarry rebrand: launch", ["quarry", "launch"], ["Soft launch to customers first, press a week later.", "Need a one-page story for sales."], "link:7"],
  ["meetings", "Weekly sync, week 41", ["weekly"], ["Harbor is on track. Lighthouse waits on the risk review.", "Decision: drop the carousel."], "link:0"],
  ["meetings", "Weekly sync, week 42", ["weekly"], ["Quarry naming narrowed to three.", "Lighthouse estimate approved."], "tasks"],
  ["meetings", "Weekly sync, week 43", ["weekly"], ["Harbor wireframes signed off.", "Hiring: one designer, start in January."], "link:2"],
  ["meetings", "Client call: Harbor", ["harbor", "client"], ["Client wants a stronger services page.", "They like the calm navigation."], "link:1"],
  ["meetings", "Client call: Quarry", ["quarry", "client"], ["Client prefers the warmest of the three names.", "Logo first, then the site."], "link:8"],
  ["meetings", "Retro: September", ["retro"], ["Went well: short meetings. Went badly: too many tools.", "Try: one notes app for everything."], "bullets"],
  ["meetings", "1:1 with Kari Eksempel", ["1on1"], ["Kari wants more ownership of Lighthouse.", "Follow up on the conference budget."], "tasks"],
  ["meetings", "Planning: Q4", ["planning"], ["Three bets for Q4: Harbor launch, Lighthouse beta, Quarry identity.", "Everything else waits."], "link:0"],
  ["work", "Team handbook", ["handbook"], ["How we work: small teams, written decisions, short meetings.", "Ask before pushing to production."], "bullets"],
  ["work", "Onboarding checklist", ["handbook", "onboarding"], ["Day one is for laptops and coffee.", "Week one ends with a small shipped change."], "tasks"],
  ["work", "Writing guide", ["handbook", "writing"], ["Plain words. Lead with the picture. Cut every sentence a reader can skip."], null],
  ["work", "Tool list", ["tools"], ["Notes, chat, calendar, code host. Nothing else without a reason."], "bullets"],
  ["inbox", "Untitled", [], ["Call the printer about the Quarry samples."], null],
  ["inbox", "Idea: visual diff for AI edits", ["idea", "ai"], ["Show AI changes as red and green, accept one by one."], null],
  ["inbox", "Idea: offline banner", ["idea"], ["A quiet line at the top when offline, nothing more."], null],
  ["inbox", "Book the dentist", [], ["Before the end of the month."], "tasks"],
  ["inbox", "Podcast to try", ["listen"], ["Someone recommended a show about city planning."], null],
  ["inbox", "Gift ideas", ["gifts"], ["Plant, cookbook, a good pen."], "bullets"],
  ["home", "Plan for the day", ["daily"], ["Morning: deep work. Afternoon: calls. Evening: walk."], "tasks"],
  ["home", "Groceries", ["shopping"], ["The usual, plus things for Sunday dinner."], "tasks"],
  ["home", "Garden: autumn", ["garden"], ["Plant tulips in late October.", "Cover the roses before frost."], "tasks"],
  ["home", "Garden: spring", ["garden"], ["Sow peas in April.", "Prune the apple tree."], "link:30"],
  ["home", "Recipes: sourdough", ["recipes"], ["Starter at 100 percent hydration.", "Bake at 250 degrees, lid on for 20 minutes."], "bullets"],
  ["home", "Recipes: fish soup", ["recipes"], ["Stock, cream, leeks, carrots, and whatever fish is fresh."], "link:32"],
  ["home", "Kitchen cupboards", ["home"], ["Go through every cupboard. One shelf per evening."], "tasks"],
  ["home", "Car service", ["car"], ["Winter tyres in November.", "Check the brake fluid."], "tasks"],
  ["home", "Budget: November", ["money"], ["Rent, food, transport, one dinner out."], "bullets"],
  ["reading", "Notes: The Calm Interface", ["book", "design"], ["Main idea: visible information makes a screen feel cleaner.", "Chapter four: predictable layouts."], null],
  ["reading", "Notes: Small Teams", ["book", "work"], ["Teams of three to five decide faster.", "Write decisions down."], "link:18"],
  ["reading", "Notes: Local First", ["book", "tech"], ["Your data lives on your device first, the cloud second.", "Conflicts should never lose work."], null],
  ["reading", "Article: Information architecture", ["article", "ia"], ["IA is organizing, labelling and prioritizing content so it is easy to find."], "link:1"],
  ["reading", "Article: Writing for screens", ["article", "writing"], ["People scan. Front-load the point."], "link:20"],
  ["reading", "Reading list", ["list"], ["Five books for winter."], "bullets"],
  ["travel", "Trip: Bergen weekend", ["trip"], ["Train Friday evening, back Sunday.", "Fish market Saturday morning."], "tasks"],
  ["travel", "Trip: Lofoten summer", ["trip"], ["Rent a cabin for a week in July.", "Bring rain gear."], "bullets"],
  ["travel", "Packing list", ["trip", "list"], ["Charger, passport, wool sweater."], "tasks"],
  ["travel", "Conference: Design Days", ["conference"], ["Two days of talks in Oslo, one workshop."], "link:16"],
  ["travel", "Hotels to remember", ["trip"], ["The small one by the harbour had the best breakfast."], null],
  ["work", "Decision log", ["decisions"], ["Every decision gets a number, a date and a reason."], "link:18"],
  ["work", "Glossary", ["handbook"], ["Journey: a stable acceptance requirement. Spike: a rival test."], "bullets"],
];

const lines = notebooks.map((nb) => ({ _type: "notebook", _id: nb._id, name: nb.name, ...(nb.parent ? { parent: { _ref: nb.parent } } : {}) }));
seeds.forEach(([nb, title, tags, paras, extra], i) => {
  const id = `fx-note-${String(i).padStart(2, "0")}`;
  const blocks = paras.map((p, j) => para(`${id}-p${j}`, text(p)));
  const links = [];
  if (extra === "tasks") blocks.push(checklist(`${id}-t`, [["First step", true], ["Second step", false], ["Follow up", false]]));
  if (extra === "bullets") blocks.push(bullets(`${id}-b`, ["One", "Two", "Three"]));
  if (extra?.startsWith("link:")) {
    const target = `fx-note-${extra.slice(5).padStart(2, "0")}`;
    blocks.push(para(`${id}-l`, text("See "), wikilink(target, seeds[+extra.slice(5)][1]), text(".")));
    links.push({ _ref: target, _key: target });
  }
  if (i % 7 === 0) blocks.unshift(heading(`${id}-h`, 2, "Summary"));
  lines.push({ _type: "note", _id: id, title, notebook: { _ref: `fx-nb-${nb}` }, tags, body: { blocks }, links });
});

writeFileSync(new URL("./notes.ndjson", import.meta.url), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
console.log(`fixtures: ${notebooks.length} notebooks, ${seeds.length} notes`);
