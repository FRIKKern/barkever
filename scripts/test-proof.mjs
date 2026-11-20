import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REPORTER, reportDir } from "./test-report.mjs";

export const LIMIT = "tracked code can forge the report";
export const PROOF = { name: "test proof", run: "node scripts/test-proof.mjs" };
export const ARGUMENTS = ["--test", "--test-timeout=<ms>", "--experimental-strip-types", "--require ./test/fake/parent-watch.cjs", "<test path>"];

const TEST_PATH = /^\w[\w./*-]*\.test\.[a-z]+$/;
const REPORT_FILE = /^\d+\.jsonl$/;

export const reporterArgs = (reporter, dir, pid) => ["--test-reporter=spec", "--test-reporter-destination=stdout", `--test-reporter=${reporter}`, `--test-reporter-destination=${join(dir, `${pid}.jsonl`)}`];

function offList(args, paths) {
  const refused = [];
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    if (arg === "--require" && args[at + 1] === "./test/fake/parent-watch.cjs") at += 1;
    else if (!(arg === "--test" || /^--test-timeout=\d+$/.test(arg) || arg === "--experimental-strip-types" || (paths && TEST_PATH.test(arg)))) refused.push(arg);
  }
  return refused;
}

function runProblems({ argv, nodeOptions }, reporter, dir) {
  const head = argv.slice(1, 5);
  const ours = head.length === 4 && head.slice(0, 3).join(" ") === reporterArgs(reporter, dir, 0).slice(0, 3).join(" ") && head[3].startsWith(`--test-reporter-destination=${dir}/`) && REPORT_FILE.test(head[3].slice(`--test-reporter-destination=${dir}/`.length));
  return [
    ...(argv[0] === "node" ? [] : [`test process ${argv[0]} is not node`]),
    ...(ours ? [] : ["node reporter arguments are not the ones own-tmp adds"]),
    ...offList(argv.slice(ours ? 5 : 1), true).map((arg) => `node argument ${arg} is not on the list`),
    ...(offList(nodeOptions.split(/\s+/).filter(Boolean), false).length ? [`NODE_OPTIONS argument ${nodeOptions} is not on the list`] : []),
  ];
}

export function prove({ job, scope, inScope, lines, dirty, reporter, dir }) {
  if (!job || !scope.jobs[job]) return [`job ${job ?? "(none)"} is not in test-scope.json`];
  const runs = lines.filter((line) => line.kind === "run");
  const results = lines.filter((line) => line.kind === "test" || line.kind === "file");
  const problems = [
    ...(inScope.length ? [] : [`job ${job}: git ls-files finds no test file in its scope`]),
    ...(runs.length ? [] : [`job ${job}: no test process was recorded`]),
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
  for (const run of runs) problems.push(...runProblems(run, reporter, dir));
  const changed = dirty.split("\n").map((line) => line.trim()).filter(Boolean);
  if (changed.length) problems.push(`the tree differs from the commit: ${changed.join("; ")}`);
  return [...new Set(problems)];
}

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });

export const scopeFiles = (globs) => (globs.length ? git("ls-files", "-z", "--", ...globs.map((glob) => `:(glob)${glob}`)).split("\0").filter(Boolean) : []);

function readLines(dir) {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .flatMap((name) => readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { kind: "test", file: `${name} (unreadable line)`, name: line, result: "fail" };
      }
    }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = JSON.parse(readFileSync(new URL("test-scope.json", import.meta.url), "utf8"));
  const job = process.env.GITHUB_JOB;
  const dir = reportDir();
  const inScope = scopeFiles(scope.jobs[job] ?? []);
  const lines = readLines(dir);
  const problems = prove({ job, scope, inScope, lines, dirty: git("status", "--porcelain"), reporter: REPORTER, dir });
  for (const problem of problems) console.error(`test proof: ${problem}`);
  if (problems.length) process.exit(1);
  console.log(`test proof: job ${job}, ${inScope.length} files, ${lines.filter((line) => line.kind === "test" && line.result === "pass").length} tests passed; limit: ${LIMIT}`);
}
