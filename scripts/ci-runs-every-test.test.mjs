import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const scripts = (dir) => JSON.parse(read(`${dir}package.json`)).scripts;

export const NOT_IN_CI = {
  "app/e2e/j10/j10.test.ts": "J10 signs in to the live server, and ci holds no session",
};

const TEST_FILE = /\.test\.[a-z]+$/;
const NARROWS = /(?:^|[\s"'=])(--test-(?:skip-pattern|name-pattern|only|shard))(?=$|[\s"'=])/gm;
const SWALLOWS = /\|\|\s*(?:true|:)(?=$|[\s;&|)])/m;

const narrowing = (text) => [...text.matchAll(NARROWS)].map(([, flag]) => `${flag} narrows the tests`);
const uncommented = (text) => text.split("\n").map((line) => line.replace(/(?:^|\s)#.*$/, "")).join("\n");

function words(command) {
  const all = command.trim().split(/\s+/).filter(Boolean).map((word) => word.replace(/^["']+|["']+$/g, ""));
  const start = all.findIndex((word) => !/^\w+=/.test(word));
  return start < 0 ? [] : all.slice(start);
}

function script([first, second, third, fourth], dir) {
  if (first === "npm" && second === "run") return [dir, third];
  if (first !== "pnpm") return [];
  if (second === "--filter" && third?.startsWith("@barkever/")) return [`${third.slice("@barkever/".length)}/`, fourth];
  return second === "run" ? [dir, third] : [dir, second];
}

function reach(text, dir, memo) {
  const plain = uncommented(text);
  const found = { tests: [], flaws: [] };
  for (const command of plain.split(/&&|\|\||[\n;|&]/).map(words)) {
    if (command[0] === "node" && command.includes("--test")) found.tests.push(...command.filter((word) => TEST_FILE.test(word)).map((word) => dir + word));
    const [at, name] = script(command, dir);
    if (!name || !scripts(at)?.[name]) continue;
    const key = at + name;
    if (!memo.has(key)) {
      memo.set(key, { tests: [], flaws: [] });
      memo.set(key, reach(scripts(at)[name], at, memo));
    }
    found.tests.push(...memo.get(key).tests);
    found.flaws.push(...memo.get(key).flaws);
  }
  if (found.tests.length) found.flaws.push(...narrowing(plain), ...(SWALLOWS.test(plain) ? ["|| true lets a failing test pass"] : []));
  return found;
}

const folder = (dir) => (dir ? `${dir.replace(/\/$/, "")}/` : "");
const set = (value) => value !== undefined && value !== false;

export function ciSteps(ciText) {
  const workflow = load(ciText);
  const { jobs } = workflow;
  const skipped = (name, path) => {
    const job = jobs[name] ?? {};
    return "if" in job || [job.needs ?? []].flat().some((need) => !path.includes(need) && skipped(need, [...path, name]));
  };
  return Object.entries(jobs)
    .filter(([name]) => !skipped(name, []))
    .flatMap(([name, job]) =>
      (job.steps ?? []).flatMap((step, index) =>
        typeof step.run !== "string" || "if" in step
          ? []
          : [{
              label: `${name} step ${index + 1}`,
              run: step.run,
              env: [workflow.env, job.env, step.env].flatMap((env) => Object.values(env ?? {})).join("\n"),
              dir: folder(step["working-directory"] ?? job.defaults?.run?.["working-directory"] ?? workflow.defaults?.run?.["working-directory"]),
              quiet: set(job["continue-on-error"]) || set(step["continue-on-error"]),
            }],
      ),
    );
}

const matcher = (glob) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*")}$`);

export function notRun(files, ciText) {
  const memo = new Map();
  const steps = ciSteps(ciText).map((step) => ({ ...step, ...reach(step.run, step.dir, memo) }));
  const run = steps.flatMap((step) => step.tests).map(matcher);
  const missed = files.filter((file) => TEST_FILE.test(file) && !run.some((glob) => glob.test(file)));
  return [
    ...steps
      .filter((step) => step.tests.length)
      .flatMap((step) => [...new Set([...(step.quiet ? ["continue-on-error lets a failing test pass"] : []), ...step.flaws, ...narrowing(step.env)])].map((flaw) => `${step.label}: ${flaw}`)),
    ...missed.filter((file) => !NOT_IN_CI[file]).map((file) => `${file}: no ci job runs it`),
    ...Object.keys(NOT_IN_CI).filter((file) => !missed.includes(file)).map((file) => `${file}: listed in NOT_IN_CI but ci runs it or it is gone`),
  ];
}

const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const ci = read(".github/workflows/ci.yml");
const SCRIPTS_RUN = "node --test --test-timeout=300000 scripts/*.test.mjs";

test("ci runs every tracked test file, so a green staging run means every test ran", () => {
  assert.deepEqual(notRun(files, ci), []);
  assert.deepEqual(notRun([...files, "app/src/lib/deep/planted.test.ts", "tools/planted.test.mjs"], ci), ["app/src/lib/deep/planted.test.ts: no ci job runs it", "tools/planted.test.mjs: no ci job runs it"]);
  assert.deepEqual(notRun(files.filter((f) => !f.startsWith("app/e2e/j10/")), ci), ["app/e2e/j10/j10.test.ts: listed in NOT_IN_CI but ci runs it or it is gone"]);
  assert.ok(notRun(files, ci.replace("scripts/*.test.mjs", "scripts/pack.test.mjs")).includes("scripts/promote.test.mjs: no ci job runs it"));
});

test("a test glob only in a comment or an echo runs nothing", () => {
  for (const tail of [" # scripts/*.test.mjs", "; echo scripts/*.test.mjs"]) {
    assert.ok(notRun(files, ci.replace("scripts/*.test.mjs", `scripts/pack.test.mjs${tail}`)).includes("scripts/promote.test.mjs: no ci job runs it"), tail);
  }
});

test("continue-on-error on a test step lets a failing test pass", () => {
  const planted = ci.replace("      - run: pnpm --filter @barkever/app test", "      - continue-on-error: true\n        run: pnpm --filter @barkever/app test");
  assert.ok(notRun(files, planted).includes("test-app step 5: continue-on-error lets a failing test pass"));
});

test("|| true after a test command lets a failing test pass", () => {
  const planted = ci.replace("pnpm --filter @barkever/mac test", "pnpm --filter @barkever/mac test || true");
  assert.ok(notRun(files, planted).includes("test-mac step 5: || true lets a failing test pass"));
});

test("a skip or name pattern on a test step narrows the tests", () => {
  const skips = ci.replace(SCRIPTS_RUN, SCRIPTS_RUN.replace("scripts/", "--test-skip-pattern=promote scripts/"));
  assert.ok(notRun(files, skips).includes("test-scripts step 5: --test-skip-pattern narrows the tests"));
  const names = ci.replace("pnpm --filter @barkever/app test", "pnpm --filter @barkever/app test -- --test-name-pattern pack");
  assert.ok(notRun(files, names).includes("test-app step 5: --test-name-pattern narrows the tests"));
  const env = ci.replace("      - run: pnpm --filter @barkever/mac test", "      - env:\n          NODE_OPTIONS: --test-only\n        run: pnpm --filter @barkever/mac test");
  assert.ok(notRun(files, env).includes("test-mac step 5: --test-only narrows the tests"));
});

test("a test job behind an if, or needing one, runs nothing", () => {
  assert.ok(notRun(files, ci.replace("  test-app:\n", "  test-app:\n    if: false\n")).some((problem) => problem.startsWith("app/src/")));
  assert.ok(notRun(files, ci.replace("  test-mac:\n", "  test-mac:\n    needs: e2e\n")).some((problem) => problem.startsWith("mac/src/")));
});
