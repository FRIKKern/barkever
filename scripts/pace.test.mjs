import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temp = mkdtempSync(join(tmpdir(), "pace-"));
after(() => rmSync(temp, { recursive: true, force: true }));

const PACE = new URL("./pace.mjs", import.meta.url).pathname;
const SNAPSHOT_AT = "2026-10-31T12:00:00.000Z";
const EARLIER_AT = "2026-10-31T10:00:00.000Z";
const GOAL = "task-42e5633d742184c5";
const miss = (at) => JSON.stringify({ at, where: "fixture", class: "fixture-class" });
const snapshot = (at, head, missesTotal) => JSON.stringify({
  at, since: "2026-10-31T06:00:00.000Z", head, hours: 6,
  commits: { count: 1, byTier: {}, add: 0, del: 0, journeys: [], list: [] },
  tasks: { total: 0, byStatus: {}, openByTier: {}, closed: [] },
  machine: { loadPerCore: 0, swapUsedPct: 0, computeBound: false, strays: [], heavyRuns: [] },
  misses: { total: missesTotal, new: missesTotal, byClass: {}, halfFixes: [] },
  barkpark: [],
  hygiene: { counts: {} },
});

const CHILDREN = [
  { doc_id: "task-after", title: "fixture", lifecycle_status: "done", updated_at: "2999-01-01T00:00:00Z" },
  { doc_id: "task-at", title: "fixture", lifecycle_status: "done", updated_at: SNAPSHOT_AT },
  { doc_id: "task-before", title: "fixture", lifecycle_status: "done", updated_at: "2026-10-31T11:00:00.000Z" },
  { doc_id: "task-between", title: "fixture", lifecycle_status: "done", updated_at: "2026-10-31T10:15:00.000Z" },
];
const PRS = [
  { number: 1, title: "after", mergedAt: "2999-01-01T00:00:00Z", additions: 1, deletions: 1 },
  { number: 2, title: "at", mergedAt: SNAPSHOT_AT, additions: 1, deletions: 1 },
  { number: 3, title: "before", mergedAt: "2026-10-31T11:00:00.000Z", additions: 1, deletions: 1 },
  { number: 4, title: "between", mergedAt: "2026-10-31T10:15:00.000Z", additions: 1, deletions: 1 },
];

function world({ bp = "ok", gh = "ok", head, missesTotal = 2, earlierAt = EARLIER_AT } = {}) {
  const dir = mkdtempSync(join(temp, "world-"));
  const git = (env, ...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: dir, env: { ...process.env, ...env } });
  const at = (date) => ({ GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  const short = () => execFileSync("git", ["rev-parse", "--short", "main"], { cwd: dir, encoding: "utf8" }).trim();
  const commit = (date, subject, text) => { writeFileSync(join(dir, "a.txt"), text); git(date ? at(date) : {}, "commit", "-qam", subject); return short(); };
  git({}, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "a.txt"), "first\n");
  git({}, "add", ".");
  git(at("2026-10-31T09:00:00Z"), "commit", "-qm", "J03: before the earlier snapshot");
  const earlier = short();
  const base = commit("2026-10-31T11:00:00Z", "base before the snapshot", "base\n");
  commit("2020-01-01T00:00:00Z", "J01: authored long ago, reached main after the snapshot", "late\n");
  const tip = commit(null, "J02: authored and landed after the snapshot", "now\n");

  mkdirSync(join(dir, "pace"));
  writeFileSync(join(dir, "pace", "snapshots.jsonl"), [
    snapshot(earlierAt, earlier, 1),
    snapshot(SNAPSHOT_AT, head === "tip" ? tip : head ?? base, missesTotal),
  ].join("\n") + "\n");
  writeFileSync(join(dir, "pace", "misses.jsonl"), [
    miss("2026-10-31T01:00:00Z"), miss("2026-10-31T02:00:00Z"),
    miss("2026-10-31T13:00:00Z"), miss("2026-10-31T11:30:00Z"),
  ].join("\n") + "\n");

  const bin = join(dir, "bin");
  mkdirSync(bin);
  const fake = (name, body) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  const bpBody = {
    ok: `[ "$3" = ${GOAL} ] && echo '${JSON.stringify({ children: CHILDREN })}' || echo '{"children":[]}'`,
    fail: "exit 1",
    refused: `echo '{"ok":false,"error":"fixture refusal"}'`,
  }[bp];
  fake("bp", bpBody);
  fake("gh", gh === "ok" ? `echo "$@" >> '${join(dir, "gh-args")}'\necho '${JSON.stringify(PRS)}'` : "exit 1");
  return { dir, bin };
}

function paceRun({ dir, bin }, env, ...args) {
  const heavy = mkdtempSync(join(temp, "heavy-"));
  return spawnSync(process.execPath, [PACE, ...args], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HEAVY_DIR: heavy, ...env } });
}

function window(header) {
  const [, start, end, hours] = header.match(/^pace (\S+) → (\S+) \((\S+) h,/);
  return { start, hours: +hours, expected: +((Date.parse(end) - Date.parse(start)) / 3600e3).toFixed(2) };
}

function pace(w, ...args) {
  const r = paceRun(w, {}, ...args);
  assert.equal(r.status, 0, r.stderr);
  const rows = Object.fromEntries(r.stdout.split("\n").filter((l) => l.startsWith("| ")).map((l) => l.split(" | ").map((c) => c.replace(/^\| | \|$/g, ""))).map(([k, v, p]) => [k, { now: v, prev: p }]));
  const header = r.stdout.split("\n")[0];
  return { rows, header, stdout: r.stdout, last: () => JSON.parse(readFileSync(join(w.dir, "pace", "snapshots.jsonl"), "utf8").trim().split("\n").at(-1)) };
}

test("commits count by reaching main after the last snapshot head, whatever their dates", () => {
  const { rows } = pace(world());
  assert.equal(rows.commits.now, "2");
  assert.equal(rows["commits hard/standard/light"].now, "0/0/2");
  assert.equal(rows["journeys touched"].now, "J01 J02");
});

test("--since starts the whole window at the last snapshot taken at or before it, and prints that start", () => {
  const { rows, header, stdout } = pace(world(), "--since", "2026-10-31T10:30:00.000Z");
  assert.match(header, /^pace 2026-10-31T10:00:00\.000Z → /);
  assert.match(stdout, /--since 2026-10-31T10:30:00\.000Z starts at the snapshot taken at 2026-10-31T10:00:00\.000Z/);
  assert.equal(rows.commits.now, "3");
  assert.equal(rows["tasks closed"].now, "4");
  assert.equal(rows["barkpark PRs merged"].now, "4");
  const { hours, expected } = window(header);
  assert.equal(hours, expected);
});

test("--since searches Barkpark merges from the snapped start's date", () => {
  const w = world({ earlierAt: "2026-10-30T23:00:00.000Z" });
  pace(w, "--since", "2026-10-31T00:30:00.000Z");
  assert.match(readFileSync(join(w.dir, "gh-args"), "utf8"), /merged:>=2026-10-30 /);
});

for (const [name, args] of [["garbage", ["--since", "garbage"]], ["a flag", ["--since", "--write"]], ["nothing", ["--since"]]]) {
  test(`--since followed by ${name} is a usage error that writes nothing`, () => {
    const w = world();
    const before = readFileSync(join(w.dir, "pace", "snapshots.jsonl"), "utf8");
    const r = paceRun(w, {}, ...args, "--write");
    assert.equal(r.status, 2);
    assert.match(r.stderr, /usage/);
    assert.equal(readFileSync(join(w.dir, "pace", "snapshots.jsonl"), "utf8"), before);
  });
}

test("--since without milliseconds at a snapshot is that snapshot, with no snap note", () => {
  const { header, stdout } = pace(world(), "--since", "2026-10-31T10:00:00Z");
  assert.match(header, /^pace 2026-10-31T10:00:00\.000Z → /);
  assert.doesNotMatch(stdout, /starts at the snapshot/);
});

test("a --since with no zone is local time everywhere, snapshot pick and window alike", () => {
  const r = paceRun(world(), { TZ: "Europe/Oslo" }, "--since", "2026-10-31T11:30:00");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^pace 2026-10-31T10:00:00\.000Z → /);
  assert.match(r.stdout, /--since 2026-10-31T10:30:00\.000Z starts at the snapshot taken at 2026-10-31T10:00:00\.000Z/);
});

test("--since before every commit on main counts them all, from that time", () => {
  const { rows, header } = pace(world(), "--since", "2000-01-01T00:00:00.000Z");
  assert.match(header, /^pace 2000-01-01T00:00:00\.000Z → /);
  assert.equal(rows.commits.now, "4");
});

test("--since exactly at a snapshot starts at that snapshot, with no note", () => {
  const { rows, header, stdout } = pace(world(), "--since", EARLIER_AT);
  assert.match(header, /^pace 2026-10-31T10:00:00\.000Z → /);
  assert.doesNotMatch(stdout, /starts at the snapshot/);
  assert.equal(rows.commits.now, "3");
});

test("--since exactly at the earliest commit date still counts every commit", () => {
  assert.equal(pace(world(), "--since", "2020-01-01T00:00:00.000Z").rows.commits.now, "4");
});

test("--since before the first snapshot but after a commit gives unknown commits over that window", () => {
  const { rows, header } = pace(world(), "--since", "2026-10-31T09:30:00.000Z");
  assert.match(header, /^pace 2026-10-31T09:30:00\.000Z → /);
  assert.equal(rows.commits.now, "unknown");
});

test("without --since the window starts at the last snapshot", () => {
  assert.match(pace(world()).header, new RegExp(`^pace ${SNAPSHOT_AT.replace(/\./g, "\\.")} → `));
});

test("nothing landed since the last snapshot head gives 0 commits and no journeys", () => {
  const { rows } = pace(world({ head: "tip" }));
  assert.equal(rows.commits.now, "0");
  assert.equal(rows["journeys touched"].now, "–");
});

test("a last snapshot head git does not know gives unknown commits, not 0", () => {
  const { rows } = pace(world({ head: "0000000" }));
  assert.equal(rows.commits.now, "unknown");
  assert.equal(rows["lines +/−"].now, "unknown");
});

test("tasks closed are the done ones updated at or after the window start", () => {
  assert.equal(pace(world()).rows["tasks closed"].now, "2");
});

test("a failed bp call prints unknown tasks, never 0", () => {
  const { rows } = pace(world({ bp: "fail" }));
  assert.equal(rows["tasks closed"].now, "unknown");
  assert.equal(rows["tasks open hard/standard/light"].now, "unknown");
});

test("a bp answer with no children list prints unknown tasks, never 0", () => {
  assert.equal(pace(world({ bp: "refused" })).rows["tasks closed"].now, "unknown");
});

test("Barkpark merges are the PRs merged at or after the window start", () => {
  assert.equal(pace(world()).rows["barkpark PRs merged"].now, "2");
});

test("a failed gh call prints unknown Barkpark merges, never 0", () => {
  assert.equal(pace(world({ gh: "fail" })).rows["barkpark PRs merged"].now, "unknown");
});

test("an unknown count is stored as null and reads back as unknown in the previous column", () => {
  const w = world({ bp: "fail", gh: "fail" });
  const first = pace(w, "--write");
  assert.equal(first.last().tasks, null);
  assert.equal(first.last().barkpark, null);
  const second = pace(w).rows;
  assert.equal(second["tasks closed"].prev, "unknown");
  assert.equal(second["barkpark PRs merged"].prev, "unknown");
});

test("new misses are the lines added since the last snapshot, a backdated one included", () => {
  assert.equal(pace(world()).rows["review misses (new / total)"].now, "2 / 4");
});

test("no misses added since the last snapshot gives 0 new, not unknown", () => {
  assert.equal(pace(world({ missesTotal: 4 })).rows["review misses (new / total)"].now, "0 / 4");
});

test("a misses log shorter than the last snapshot's count gives unknown new misses", () => {
  assert.equal(pace(world({ missesTotal: 9 })).rows["review misses (new / total)"].now, "unknown / 4");
});
