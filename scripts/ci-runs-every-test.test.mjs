import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const scripts = (dir) => (existsSync(new URL(`../${dir}package.json`, import.meta.url)) ? JSON.parse(read(`${dir}package.json`)).scripts ?? {} : null);

export const NOT_IN_CI = {
  "app/e2e/j10/j10.test.ts": "J10 signs in to the live server, and ci holds no session",
};

const TEST_FILE = /\.test\.[a-z]+$/;
const NAMES_TESTS = /--test|\.test\./;
const TEST_FLAG = /--test[^\s"'=]*(?:=[^\s"']*)?/g;
const READ_FLAG = /^--test(?:-timeout=\d+|-concurrency=\d+)?$/;
const QUOTE = /'[^']*'|"[^"]*"/g;
const OPERATOR = /\|\||<<|\$\(|(?<!&)&(?!&)|[;|()`\\]/;
const KEYWORDS = new Set(["!", "if", "then", "case", "for", "while", "until", "function", "set", "trap", "exit", "return", "exec", "eval", "source", ".", "bash", "sh", "zsh", "dash"]);

const uncommented = (text) => text.split("\n").map((line) => line.replace(/(?:^|\s)#.*$/, "")).join("\n");
const unquoted = (text) => text.replace(QUOTE, " ");
const unread = (text) => [...text.matchAll(TEST_FLAG)].map(([flag]) => flag).filter((flag) => !READ_FLAG.test(flag)).map((flag) => `${flag} is a test flag the check does not read`);

function words(command) {
  const all = command.trim().split(/\s+/).filter(Boolean);
  const start = all.findIndex((word) => !/^\w+=/.test(word));
  return start < 0 ? [] : all.slice(start);
}

function shape(text) {
  const held = (text.match(QUOTE) ?? []).find((quote) => NAMES_TESTS.test(quote));
  if (held) return held;
  const bare = unquoted(text);
  return bare.match(/['"]/)?.[0] ?? bare.match(OPERATOR)?.[0] ?? bare.split(/&&|\n/).map((command) => words(command)[0]).find((word) => KEYWORDS.has(word)) ?? null;
}

function links(text, dir) {
  const found = [];
  const flaws = [];
  for (const [, name] of text.matchAll(/\bnpm run ([\w:-]+)/g)) found.push([dir, name]);
  for (const [, name] of text.matchAll(/\bpnpm (?:run )?([\w:][\w:-]*)/g)) found.push([dir, name]);
  for (const [, target, name] of text.matchAll(/\bpnpm --filter[= ](\S+) (?:run )?([\w:-]+)/g)) {
    const at = `${/^@barkever\/([\w-]+)$/.exec(target)?.[1]}/`;
    if (scripts(at)) found.push([at, name]);
    else flaws.push(`--filter ${target} names no package the check can read`);
  }
  return { found, flaws };
}

function reach(text, dir, memo) {
  const plain = uncommented(text);
  const { found, flaws } = links(plain, dir);
  const below = found
    .filter(([at, name]) => scripts(at)?.[name])
    .map(([at, name]) => {
      const key = `${at}package.json ${name}`;
      if (!memo.has(key)) {
        memo.set(key, { bound: false, tests: [], flaws: [] });
        const got = reach(scripts(at)[name], at, memo);
        memo.set(key, { ...got, flaws: got.flaws.map((flaw) => `${key}: ${flaw}`) });
      }
      return memo.get(key);
    });
  const all = [...flaws, ...below.flatMap((script) => script.flaws)];
  const bound = NAMES_TESTS.test(plain) || below.some((script) => script.bound);
  if (!bound) return { bound, tests: [], flaws: all };
  const odd = shape(plain);
  if (odd) return { bound, tests: [], flaws: [...all, `${odd} is a shape the check cannot read`] };
  const tests = unquoted(plain)
    .split(/&&|\n/)
    .map(words)
    .filter((command) => command[0] === "node" && command.includes("--test"))
    .flatMap((command) => command.filter((word) => TEST_FILE.test(word)).map((word) => dir + word));
  return { bound, tests: [...tests, ...below.flatMap((script) => script.tests)], flaws: [...all, ...unread(plain)] };
}

const folder = (dir) => (dir ? `${dir.replace(/\/$/, "")}/` : "");
const set = (value) => value !== undefined && value !== false;

function ciSteps(ciText) {
  const workflow = load(ciText);
  const jobs = workflow.jobs ?? {};
  const behind = (name, path) => {
    const job = jobs[name] ?? {};
    return "if" in job || [job.needs ?? []].flat().some((need) => !path.includes(need) && behind(need, [...path, name]));
  };
  return Object.entries(jobs).flatMap(([name, job]) =>
    (job.steps ?? []).flatMap((step, index) =>
      typeof step.run !== "string"
        ? []
        : [{
            label: `${name} step ${index + 1}`,
            run: step.run,
            dir: folder(step["working-directory"] ?? job.defaults?.run?.["working-directory"] ?? workflow.defaults?.run?.["working-directory"]),
            skip: "if" in job || "if" in step ? "behind an if, which the check does not read" : behind(name, []) ? "needs a job behind an if, which the check does not read" : null,
            quiet: set(job["continue-on-error"]) || set(step["continue-on-error"]),
            shells: [step.shell, job.defaults?.run?.shell, workflow.defaults?.run?.shell].filter((shell) => shell !== undefined),
            env: [workflow.env, job.env, step.env].flatMap((env) => Object.values(env ?? {})).map(String).join("\n"),
          }],
    ),
  );
}

const matcher = (glob) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*")}$`);

export function notRun(files, ciText) {
  const memo = new Map();
  const steps = ciSteps(ciText).map((step) => ({ ...step, ...reach(step.run, step.dir, memo) }));
  const run = steps.filter((step) => !step.skip).flatMap((step) => step.tests).map(matcher);
  const missed = files.filter((file) => TEST_FILE.test(file) && !run.some((glob) => glob.test(file)));
  const refusals = (step) => [
    ...(step.skip ? [step.skip] : []),
    ...(step.quiet ? ["continue-on-error lets a failing test pass"] : []),
    ...step.shells.filter((shell) => shell !== "bash").map((shell) => `shell ${shell}, which the check does not read`),
    ...unread(step.env),
  ];
  return [
    ...steps.flatMap((step) => [...new Set([...(step.bound ? refusals(step) : []), ...step.flaws])].map((flaw) => `${step.label}: ${flaw}`)),
    ...missed.filter((file) => !NOT_IN_CI[file]).map((file) => `${file}: no ci job runs it`),
    ...Object.keys(NOT_IN_CI).filter((file) => !missed.includes(file)).map((file) => `${file}: listed in NOT_IN_CI but ci runs it or it is gone`),
  ];
}

const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const ci = read(".github/workflows/ci.yml");

test("ci runs every tracked test file, so a green staging run means every test ran", () => {
  assert.deepEqual(notRun(files, ci), []);
  assert.deepEqual(notRun([...files, "app/src/lib/deep/planted.test.ts", "tools/planted.test.mjs"], ci), ["app/src/lib/deep/planted.test.ts: no ci job runs it", "tools/planted.test.mjs: no ci job runs it"]);
  assert.deepEqual(notRun(files.filter((f) => !f.startsWith("app/e2e/j10/")), ci), ["app/e2e/j10/j10.test.ts: listed in NOT_IN_CI but ci runs it or it is gone"]);
  assert.ok(notRun(files, ci.replace("scripts/*.test.mjs", "scripts/pack.test.mjs")).includes("scripts/promote.test.mjs: no ci job runs it"));
});

const SCRIPTS = "      - run: node scripts/own-tmp.mjs --deadline=1200000 node --test --test-timeout=300000 scripts/*.test.mjs";
const MAC = "      - run: pnpm --filter @barkever/mac test";
const APP = "      - run: pnpm --filter @barkever/app test";
const step = (lines, keys = {}) => ["      - run: |", ...lines.map((line) => `          ${line}`), ...Object.entries(keys).map(([key, value]) => `        ${key}: ${value}`)].join("\n");
const shapeOf = (label, token) => `${label} step 5: ${token} is a shape the check cannot read`;
const flagOf = (label, flag) => `${label} step 5: ${flag} is a test flag the check does not read`;

const PLANTS = [
  ["a glob only in a comment", SCRIPTS, SCRIPTS.replace(" scripts/*", " scripts/pack.test.mjs # scripts/*"), "scripts/promote.test.mjs: no ci job runs it"],
  ["a glob only in an echo", SCRIPTS, SCRIPTS.replace(" scripts/*", " scripts/pack.test.mjs; echo scripts/*"), "scripts/promote.test.mjs: no ci job runs it"],
  ["a test inside a quoted echo, cut by ;", SCRIPTS, step(["echo 'skipped; node --test scripts/*.test.mjs' && node --test scripts/pack.test.mjs"]), shapeOf("test-scripts", "'skipped; node --test scripts/*.test.mjs'")],
  ["a test inside a quoted echo, cut by &&", SCRIPTS, step(['echo "later && node --test scripts/*.test.mjs" && node --test scripts/pack.test.mjs']), shapeOf("test-scripts", '"later && node --test scripts/*.test.mjs"')],
  ["exit 0 before the test", SCRIPTS, step(["exit 0; node --test scripts/*.test.mjs"]), shapeOf("test-scripts", ";")],
  ["true || before the test", SCRIPTS, step(["true || node --test scripts/*.test.mjs"]), shapeOf("test-scripts", "||")],
  ["bash -c around the test", SCRIPTS, step(["bash -c 'exit 0; node --test scripts/*.test.mjs'"]), shapeOf("test-scripts", "'exit 0; node --test scripts/*.test.mjs'")],
  ["the test inside a heredoc", SCRIPTS, step(["cat <<EOF", "node --test scripts/*.test.mjs", "EOF"]), shapeOf("test-scripts", "<<")],
  ["the test as a continued echo line", SCRIPTS, step(["echo \\", "node --test scripts/*.test.mjs"]), shapeOf("test-scripts", "\\")],
  ["continue-on-error on a test step", APP, `      - continue-on-error: true\n        run: pnpm --filter @barkever/app test`, "test-app step 5: continue-on-error lets a failing test pass"],
  ["|| true after a test command", MAC, `${MAC} || true`, shapeOf("test-mac", "||")],
  ["|| exit 0 after a test command", MAC, `${MAC} || exit 0`, shapeOf("test-mac", "||")],
  ["|| echo after a test command", MAC, `${MAC} || echo failed`, shapeOf("test-mac", "||")],
  ["set +e before the test", MAC, step(["set +e", "pnpm --filter @barkever/mac test", "echo done"]), shapeOf("test-mac", "set")],
  ["trap exit 0 before the test", MAC, step(["trap 'exit 0' EXIT", "pnpm --filter @barkever/mac test"]), shapeOf("test-mac", "trap")],
  ["shell bash {0} without -e", MAC, step(["pnpm --filter @barkever/mac test", "echo done"], { shell: "bash {0}" }), "test-mac step 5: shell bash {0}, which the check does not read"],
  ["shell sh with a pipe", MAC, step(["pnpm --filter @barkever/mac test | tee mac.log"], { shell: "sh" }), "test-mac step 5: shell sh, which the check does not read"],
  ["the test sent to the background", MAC, `${MAC} &`, shapeOf("test-mac", "&")],
  ["a skip pattern on the test command", SCRIPTS, SCRIPTS.replace(" scripts/*", " --test-skip-pattern=promote scripts/*"), flagOf("test-scripts", "--test-skip-pattern=promote")],
  ["a name pattern passed through pnpm", APP, `${APP} -- --test-name-pattern pack`, flagOf("test-app", "--test-name-pattern")],
  ["--test-only in the step env", MAC, `      - env:\n          NODE_OPTIONS: --test-only\n        run: pnpm --filter @barkever/mac test`, flagOf("test-mac", "--test-only")],
  ["a skip pattern split by quotes", SCRIPTS, SCRIPTS.replace(" scripts/*", ' --test-sk""ip-pattern=promote scripts/*'), flagOf("test-scripts", "--test-sk")],
  ["a test job behind an if", "  test-app:\n", "  test-app:\n    if: false\n", "test-app step 5: behind an if, which the check does not read"],
  ["a test job needing a job behind an if", "  test-mac:\n", "  test-mac:\n    needs: e2e\n", "test-mac step 5: needs a job behind an if, which the check does not read"],
  ["a matrix value in --filter", MAC, "      - run: pnpm --filter @barkever/${{ matrix.pkg }} test", "test-mac step 5: --filter @barkever/${{ names no package the check can read"],
];

for (const [name, from, to, problem] of PLANTS) {
  test(`plant: ${name}`, () => {
    assert.ok(ci.includes(from), from);
    const problems = notRun(files, ci.replace(from, () => to));
    assert.ok(problems.includes(problem), JSON.stringify(problems));
  });
}
