import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPORTER, reportDir } from "./test-report.mjs";

export const LIMIT = "tracked code can forge the report; a test file that ends its own process early with exit 0 belongs to this limit";
export const LIMIT_PLANT = 'import { test } from "node:test";\ntest("first", () => {});\ntest("second", async () => {\n  await new Promise((done) => setTimeout(done, 50));\n  process.exit(0);\n});\ntest("third", () => {\n  throw new Error("never reported");\n});\n';
export const PROOF = { name: "test proof", run: "node scripts/test-proof.mjs" };
export const ARGUMENTS = [
  { arg: "--test" },
  { arg: "--test-timeout=<ms>" },
  { arg: "--experimental-strip-types" },
  { arg: "--require ./test/fake/parent-watch.cjs", folder: "mac" },
  { arg: "<test path>" },
];
export const FOLDERS = ["", "app", "mac"];

const TEST_PATH = /^\w[\w./*-]*\.test\.[a-z]+$/;
const RESULTS = /^(\d+)\.jsonl$/;
const RUN = /^(\d+)\.run\.jsonl$/;
const word = (part) => new RegExp(`^${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("<ms>", "\\d+")}$`);
const MATCHERS = ARGUMENTS.map((entry) => (entry.arg === "<test path>" ? { ...entry, path: true, words: [TEST_PATH] } : { ...entry, path: false, words: entry.arg.split(" ").map(word) }));

export const reporterArgs = (reporter, dir, pid) => ["--test-reporter=spec", "--test-reporter-destination=stdout", `--test-reporter=${reporter}`, `--test-reporter-destination=${join(dir, `${pid}.jsonl`)}`];

function offList(args, paths, folder) {
  const refused = [];
  for (let at = 0; at < args.length; at += 1) {
    const hit = MATCHERS.find((entry) => (paths || !entry.path) && (entry.folder === undefined || entry.folder === folder) && entry.words.every((pattern, step) => pattern.test(args[at + step] ?? "")));
    if (hit) at += hit.words.length - 1;
    else refused.push(args[at]);
  }
  return refused;
}

function runProblems(name, pid, { argv = [], nodeOptions = "", cwd = "" }, { reporter, dir, root }) {
  const folder = isAbsolute(cwd) ? relative(root, cwd) : null;
  const ours = JSON.stringify(argv.slice(1, 5)) === JSON.stringify(reporterArgs(reporter, dir, pid));
  return [
    ...(argv[0] === "node" ? [] : [`${name}: test process ${argv[0]} is not node`]),
    ...(ours ? [] : [`${name}: node reporter arguments are not the ones own-tmp adds for ${pid}.jsonl`]),
    ...(FOLDERS.includes(folder) ? [] : [`${name}: working folder ${cwd || "(none)"} is not the repo, app or mac`]),
    ...offList(argv.slice(ours ? 5 : 1), true, folder).map((arg) => `${name}: node argument ${arg} is not on the list`),
    ...(offList(nodeOptions.split(/\s+/).filter(Boolean), false, folder).length ? [`${name}: NODE_OPTIONS argument ${nodeOptions} is not on the list`] : []),
  ];
}

function paired(reports, context) {
  const problems = [];
  const results = [];
  let runs = 0;
  for (const [name, lines] of Object.entries(reports)) {
    const run = RUN.exec(name);
    const report = RESULTS.exec(name);
    if (run) {
      runs += 1;
      if (!reports[`${run[1]}.jsonl`]) problems.push(`${name}: its run has no report file ${run[1]}.jsonl`);
      if (lines.length !== 1 || lines[0].kind !== "run") problems.push(`${name}: holds ${lines.length} lines, not one run record`);
      for (const line of lines) problems.push(...runProblems(name, Number(run[1]), line, context));
    } else if (report) {
      if (!reports[`${report[1]}.run.jsonl`]) problems.push(`${name}: a report with no run record ${report[1]}.run.jsonl`);
      else results.push(...lines.filter((line) => line.kind === "test" || line.kind === "file"));
      if (lines.some((line) => line.kind !== "test" && line.kind !== "file")) problems.push(`${name}: holds a line that is not a test result`);
    } else problems.push(`${name}: not a file own-tmp writes, in the report folder`);
  }
  return { problems, results, runs };
}

export function prove({ job, scope, inScope, reports, dirty, flags, reporter, dir, root }) {
  if (!job || !scope.jobs[job]) return [`job ${job ?? "(none)"} is not in test-scope.json`];
  const { problems: pairing, results, runs } = paired(reports, { reporter, dir, root });
  const problems = [
    ...(inScope.length ? [] : [`job ${job}: git ls-files finds no test file in its scope`]),
    ...(runs ? [] : [`job ${job}: no test process was recorded`]),
    ...(results.length ? [] : [`job ${job}: no test was reported`]),
  ];
  const byFile = Map.groupBy(results, (line) => line.file);
  for (const file of inScope) {
    const rows = byFile.get(file) ?? [];
    if (!rows.length) {
      problems.push(`${file}: no report in this run (no command ran it, or it crashed, timed out or was killed)`);
      continue;
    }
    const failed = rows.filter((row) => row.result === "fail").map((row) => row.name);
    const skipped = rows.filter((row) => (row.result === "skip" || row.result === "todo") && !scope.skips.some((skip) => skip.file === file && skip.name === row.name)).map((row) => row.name);
    if (failed.length) problems.push(`${file}: failed: ${failed.join(", ")}`);
    if (!rows.some((row) => row.kind === "test" && row.result === "pass")) problems.push(`${file}: no test passed`);
    if (skipped.length) problems.push(`${file}: skipped beyond the skip list: ${skipped.join(", ")}`);
  }
  for (const file of byFile.keys()) if (!inScope.includes(file)) problems.push(`${file}: reported, but not in job ${job}'s scope`);
  problems.push(...pairing);
  const changed = dirty.split("\n").map((line) => line.trim()).filter(Boolean);
  if (changed.length) problems.push(`the tree differs from the commit: ${changed.join("; ")}`);
  for (const line of flags.split("\n").filter(Boolean)) if (!line.startsWith("H ")) problems.push(`the index hides edits to ${line.slice(2)} (git ls-files -v tag ${line[0]})`);
  return [...new Set(problems)];
}

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

export const scopeFiles = (globs) => (globs.length ? git("ls-files", "-z", "--", ...globs.map((glob) => `:(glob)${glob}`)).split("\0").filter(Boolean) : []);

export function readReports(dir) {
  if (!dir || !existsSync(dir)) return {};
  return Object.fromEntries(readdirSync(dir).map((name) => [name, readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { kind: "unreadable", line };
    }
  })]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = JSON.parse(readFileSync(new URL("test-scope.json", import.meta.url), "utf8"));
  const job = process.env.GITHUB_JOB;
  const dir = reportDir();
  const inScope = scopeFiles(scope.jobs[job] ?? []);
  const reports = readReports(dir);
  const problems = prove({ job, scope, inScope, reports, dirty: git("status", "--porcelain"), flags: git("ls-files", "-v"), reporter: REPORTER, dir, root });
  for (const problem of problems) console.error(`test proof: ${problem}`);
  if (problems.length) process.exit(1);
  const passed = Object.values(reports).flat().filter((line) => line.kind === "test" && line.result === "pass").length;
  console.log(`test proof: job ${job}, ${inScope.length} files, ${passed} tests passed; limit: ${LIMIT}`);
}
