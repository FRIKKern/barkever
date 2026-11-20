import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readOrNull = (path) => (existsSync(new URL(`../${path}`, import.meta.url)) ? read(path) : null);

export const NOT_IN_CI = {
  "app/e2e/j10/j10.test.ts": "J10 signs in to the live server, and ci holds no session",
};

const TEST_FILE = /\.test\.[a-z]+$/;
const NAMES_TESTS = /--test|\.test\./;
const SCRIPT = /^[\w:-]+$/;
const PATH = /^[\w.][\w./-]*$/;
const GLOB = /^\w[\w./*-]*$/;
const PACKAGE = /^@barkever\/([\w-]+)$/;
const PNPM_OWN = new Set(["add", "audit", "dedupe", "dlx", "exec", "fetch", "i", "import", "install", "it", "link", "ln", "ls", "list", "outdated", "pack", "patch", "prune", "publish", "rebuild", "remove", "rm", "root", "run", "store", "un", "uninstall", "unlink", "up", "update", "why"]);
const USES = new Set(["actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", "pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115", "actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1"]);
const JOB_KEYS = new Set(["name", "runs-on", "timeout-minutes", "env", "steps"]);
const STEP_KEYS = new Set(["name", "uses", "with", "run", "env", "shell"]);
const WITH_KEYS = new Set(["fetch-depth", "persist-credentials", "node-version", "cache"]);
const ENV_KEYS = new Set(["ELECTRON_SKIP_BINARY_DOWNLOAD"]);
const NPMRC_KEYS = new Set(["save-exact", "engine-strict", "fund"]);
const SAID = { if: "behind an if, which the check does not read", "continue-on-error": "continue-on-error lets a failing test pass" };

const tracked = (ctx, dir, path) => PATH.test(path ?? "") && ctx.tracked.has(posix.normalize(dir + path));
const scriptOf = (ctx, dir, name) => ctx.packageOf(dir)?.scripts?.[name];
const runnable = (ctx, dir, name) => SCRIPT.test(name ?? "") && !PNPM_OWN.has(name) && typeof scriptOf(ctx, dir, name) === "string";
const filterDir = (ctx, target) => {
  const name = PACKAGE.exec(target)?.[1];
  return name && ctx.packages.has(name) && ctx.packageOf(`${name}/`)?.name === target ? `${name}/` : null;
};

function testRun(words, dir, ctx) {
  let at = words[0] === "--require" && tracked(ctx, dir, words[1]) && !TEST_FILE.test(words[1]) ? 2 : 0;
  if (words[at] !== "--test") return null;
  at += 1;
  while (/^--test-timeout=\d+$/.test(words[at]) || words[at] === "--experimental-strip-types") at += 1;
  const paths = words.slice(at);
  return paths.length && paths.every((path) => GLOB.test(path) && TEST_FILE.test(path)) ? { tests: paths.map((path) => dir + path) } : null;
}

export const SHAPES = {
  "pnpm install --frozen-lockfile": (w) => w.join(" ") === "pnpm install --frozen-lockfile" && {},
  "npm run <script>": (w, dir, ctx) => w.length === 3 && w[0] === "npm" && w[1] === "run" && runnable(ctx, dir, w[2]) && { follow: [[dir, w[2]]] },
  "pnpm <script>": (w, dir, ctx) => w.length === 2 && w[0] === "pnpm" && runnable(ctx, dir, w[1]) && { follow: [[dir, w[1]]] },
  "pnpm --filter @barkever/<package> <script>": (w, dir, ctx) => {
    const at = w.length === 4 && w[0] === "pnpm" && w[1] === "--filter" && filterDir(ctx, w[2]);
    return at && runnable(ctx, at, w[3]) && { follow: [[at, w[3]]] };
  },
  "pnpm --filter @barkever/<package> exec tsx <path>": (w, dir, ctx) => {
    const at = w.length === 6 && w[0] === "pnpm" && w[1] === "--filter" && w[3] === "exec" && w[4] === "tsx" && filterDir(ctx, w[2]);
    return at && tracked(ctx, at, w[5]) && !TEST_FILE.test(w[5]) && {};
  },
  "node <path>": (w, dir, ctx) => w.length === 2 && w[0] === "node" && tracked(ctx, dir, w[1]) && !TEST_FILE.test(w[1]) && {},
  "node <flags> --test <flags> <tests>": (w, dir, ctx) => w[0] === "node" && testRun(w.slice(1), dir, ctx),
  "node scripts/own-tmp.mjs --deadline=<ms> node <flags> --test <flags> <tests>": (w, dir, ctx) =>
    w[0] === "node" && PATH.test(w[1] ?? "") && posix.normalize(dir + w[1]) === "scripts/own-tmp.mjs" && /^--deadline=\d+$/.test(w[2] ?? "") && w[3] === "node" && testRun(w.slice(4), dir, ctx),
};

const noShape = (part) => `${JSON.stringify(part)} matches no shape the check reads`;

function grammar(text, dir, ctx, inScript) {
  const found = { tests: [], flaws: [] };
  const parts = (inScript ? [text] : text.split("\n")).flatMap((line) => line.split("&&")).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const words = part.split(/ +/);
    const hit = Object.values(SHAPES).map((shape) => shape(words, dir, ctx)).find(Boolean);
    if (!hit) {
      found.flaws.push(noShape(part));
      continue;
    }
    found.tests.push(...(hit.tests ?? []));
    for (const [at, name] of hit.follow ?? []) {
      const key = `${at}package.json ${name}`;
      if (!ctx.memo.has(key)) {
        ctx.memo.set(key, { tests: [], flaws: [] });
        const got = grammar(scriptOf(ctx, at, name), at, ctx, true);
        ctx.memo.set(key, { tests: got.tests, flaws: got.flaws.map((flaw) => `${key}: ${flaw}`) });
      }
      found.tests.push(...ctx.memo.get(key).tests);
      found.flaws.push(...ctx.memo.get(key).flaws);
    }
  }
  return found;
}

function reaches(text, dir, ctx, seen) {
  if (NAMES_TESTS.test(text)) return true;
  const links = [
    ...[...text.matchAll(/\bnpm run ([\w:-]+)/g)].map(([, name]) => [dir, name]),
    ...[...text.matchAll(/\bpnpm (?:run )?([\w:][\w:-]*)/g)].map(([, name]) => [dir, name]),
    ...[...text.matchAll(/\bpnpm --filter[= ](\S+) (?:run )?([\w:-]+)/g)].map(([, target, name]) => [filterDir(ctx, target), name]),
  ];
  return links.some(([at, name]) => {
    if (!at && at !== "") return true;
    if (seen.has(at + name)) return false;
    seen.add(at + name);
    const body = scriptOf(ctx, at, name);
    return typeof body === "string" && reaches(body, at, ctx, seen);
  });
}

const unlisted = (where, object, allowed, kind) =>
  Object.keys(object ?? {}).filter((key) => !allowed.has(key)).map((key) => `${where}: ${SAID[key] ?? `${kind} key ${key} is not one the check reads`}`);

function sharedFlaws(workflow, ctx) {
  const flaws = unlisted("workflow", workflow.env, ENV_KEYS, "env");
  if (workflow.defaults !== undefined && JSON.stringify(workflow.defaults) !== JSON.stringify({ run: { shell: "bash" } })) flaws.push(`workflow: defaults ${JSON.stringify(workflow.defaults)}, which the check does not read`);
  for (const file of ctx.files.filter((path) => posix.basename(path) === ".npmrc")) {
    const keys = (ctx.readFile(file) ?? "").split("\n").map((line) => line.split("=")[0].trim()).filter(Boolean);
    flaws.push(...keys.filter((key) => !NPMRC_KEYS.has(key)).map((key) => `${file}: npmrc key ${key} is not one the check reads`));
  }
  return [...flaws, ...unlisted("pnpm-workspace.yaml", ctx.workspace, new Set(["packages"]), "workspace")];
}

function jobFlaws(name, job, ctx) {
  const flaws = [...unlisted(name, job, JOB_KEYS, "job"), ...unlisted(name, job.env, ENV_KEYS, "env")];
  const tests = [];
  job.steps.forEach((step, index) => {
    const label = `${name} step ${index + 1}`;
    flaws.push(...unlisted(label, step, STEP_KEYS, "step"), ...unlisted(label, step.with, WITH_KEYS, "with"), ...unlisted(label, step.env, ENV_KEYS, "env"));
    if ("shell" in step && step.shell !== "bash") flaws.push(`${label}: shell ${step.shell}, which the check does not read`);
    if ("uses" in step && !USES.has(step.uses)) flaws.push(`${label}: ${step.uses} is not a pinned action`);
    if (typeof step.run === "string") {
      const got = grammar(step.run, "", ctx, false);
      tests.push(...got.tests);
      flaws.push(...got.flaws.map((flaw) => `${label}: ${flaw}`));
    }
  });
  return { tests, flaws: [...new Set(flaws)] };
}

const matcher = (glob) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*")}$`);

export function notRun(files, ciText, readFile = readOrNull) {
  const packageOf = (dir) => {
    const text = readFile(`${dir}package.json`);
    return text === null ? null : JSON.parse(text);
  };
  const workspace = load(readFile("pnpm-workspace.yaml") ?? "") ?? {};
  const ctx = { files, tracked: new Set(files), readFile, packageOf, workspace, packages: new Set(workspace.packages ?? []), memo: new Map() };
  const workflow = load(ciText);
  const jobs = Object.entries(workflow.jobs ?? {}).filter(([, job]) => (job.steps ?? []).some((step) => typeof step.run === "string" && reaches(step.run, "", ctx, new Set())));
  const shared = jobs.length ? sharedFlaws(workflow, ctx) : [];
  const checked = jobs.map(([name, job]) => jobFlaws(name, job, ctx));
  const run = shared.length ? [] : checked.filter((job) => !job.flaws.length).flatMap((job) => job.tests).map(matcher);
  const missed = files.filter((file) => TEST_FILE.test(file) && !run.some((glob) => glob.test(file)));
  return [
    ...shared,
    ...checked.flatMap((job) => job.flaws),
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

test("the check reads eight command shapes and no others", () => {
  assert.deepEqual(Object.keys(SHAPES), [
    "pnpm install --frozen-lockfile",
    "npm run <script>",
    "pnpm <script>",
    "pnpm --filter @barkever/<package> <script>",
    "pnpm --filter @barkever/<package> exec tsx <path>",
    "node <path>",
    "node <flags> --test <flags> <tests>",
    "node scripts/own-tmp.mjs --deadline=<ms> node <flags> --test <flags> <tests>",
  ]);
});

const SCRIPTS_RUN = "node scripts/own-tmp.mjs --deadline=1200000 node --test --test-timeout=300000 scripts/*.test.mjs";
const SCRIPTS = `      - run: ${SCRIPTS_RUN}`;
const MAC = "      - run: pnpm --filter @barkever/mac test";
const APP = "      - run: pnpm --filter @barkever/app test";
const CHECKOUT = "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const step = (lines, keys = {}) => ["      - run: |", ...lines.map((line) => `          ${line}`), ...Object.entries(keys).map(([key, value]) => `        ${key}: ${value}`)].join("\n");
const says = (label, part) => `${label}: ${noShape(part)}`;
const appPackage = JSON.parse(read("app/package.json"));
const appTest = (body) => (path) => (path === "app/package.json" ? JSON.stringify({ ...appPackage, scripts: { ...appPackage.scripts, test: body } }) : readOrNull(path));
const withFile = (file, text) => (path) => (path === file ? text : readOrNull(path));

const PLANTS = [
  ["a glob only in a comment", SCRIPTS, SCRIPTS.replace(" scripts/*", " scripts/pack.test.mjs # scripts/*"), "scripts/promote.test.mjs: no ci job runs it"],
  ["a glob only in an echo", SCRIPTS, SCRIPTS.replace(" scripts/*", " scripts/pack.test.mjs; echo scripts/*"), "scripts/promote.test.mjs: no ci job runs it"],
  ["a test inside a quoted echo, cut by ;", SCRIPTS, step(["echo 'skipped; node --test scripts/*.test.mjs' && node --test scripts/pack.test.mjs"]), says("test-scripts step 5", "echo 'skipped; node --test scripts/*.test.mjs'")],
  ["a test inside a quoted echo, cut by &&", SCRIPTS, step(['echo "later && node --test scripts/*.test.mjs" && node --test scripts/pack.test.mjs']), says("test-scripts step 5", 'echo "later')],
  ["exit 0 before the test", SCRIPTS, step(["exit 0; node --test scripts/*.test.mjs"]), says("test-scripts step 5", "exit 0; node --test scripts/*.test.mjs")],
  ["true || before the test", SCRIPTS, step(["true || node --test scripts/*.test.mjs"]), says("test-scripts step 5", "true || node --test scripts/*.test.mjs")],
  ["bash -c around the test", SCRIPTS, step(["bash -c 'exit 0; node --test scripts/*.test.mjs'"]), says("test-scripts step 5", "bash -c 'exit 0; node --test scripts/*.test.mjs'")],
  ["the test inside a heredoc", SCRIPTS, step(["cat <<EOF", "node --test scripts/*.test.mjs", "EOF"]), says("test-scripts step 5", "cat <<EOF")],
  ["the test as a continued echo line", SCRIPTS, step(["echo \\", "node --test scripts/*.test.mjs"]), says("test-scripts step 5", "echo \\")],
  ["continue-on-error on a test step", APP, `      - continue-on-error: true\n        run: pnpm --filter @barkever/app test`, "test-app step 5: continue-on-error lets a failing test pass"],
  ["|| true after a test command", MAC, `${MAC} || true`, says("test-mac step 5", "pnpm --filter @barkever/mac test || true")],
  ["|| exit 0 after a test command", MAC, `${MAC} || exit 0`, says("test-mac step 5", "pnpm --filter @barkever/mac test || exit 0")],
  ["|| echo after a test command", MAC, `${MAC} || echo failed`, says("test-mac step 5", "pnpm --filter @barkever/mac test || echo failed")],
  ["set +e before the test", MAC, step(["set +e", "pnpm --filter @barkever/mac test", "echo done"]), says("test-mac step 5", "set +e")],
  ["trap exit 0 before the test", MAC, step(["trap 'exit 0' EXIT", "pnpm --filter @barkever/mac test"]), says("test-mac step 5", "trap 'exit 0' EXIT")],
  ["shell bash {0} without -e", MAC, step(["pnpm --filter @barkever/mac test", "echo done"], { shell: "bash {0}" }), "test-mac step 5: shell bash {0}, which the check does not read"],
  ["shell sh with a pipe", MAC, step(["pnpm --filter @barkever/mac test | tee mac.log"], { shell: "sh" }), "test-mac step 5: shell sh, which the check does not read"],
  ["the test sent to the background", MAC, `${MAC} &`, says("test-mac step 5", "pnpm --filter @barkever/mac test &")],
  ["a skip pattern on the test command", SCRIPTS, SCRIPTS.replace(" scripts/*", " --test-skip-pattern=promote scripts/*"), says("test-scripts step 5", SCRIPTS_RUN.replace(" scripts/*", " --test-skip-pattern=promote scripts/*"))],
  ["a name pattern passed through pnpm", APP, `${APP} -- --test-name-pattern pack`, says("test-app step 5", "pnpm --filter @barkever/app test -- --test-name-pattern pack")],
  ["--test-only in the step env", MAC, `      - env:\n          NODE_OPTIONS: --test-only\n        run: pnpm --filter @barkever/mac test`, "test-mac step 5: env key NODE_OPTIONS is not one the check reads"],
  ["a skip pattern split by quotes", SCRIPTS, SCRIPTS.replace(" scripts/*", ' --test-sk""ip-pattern=promote scripts/*'), says("test-scripts step 5", SCRIPTS_RUN.replace(" scripts/*", ' --test-sk""ip-pattern=promote scripts/*'))],
  ["a test job behind an if", "  test-app:\n", "  test-app:\n    if: false\n", "test-app: behind an if, which the check does not read"],
  ["a test job needing a job behind an if", "  test-mac:\n", "  test-mac:\n    needs: e2e\n", "test-mac: job key needs is not one the check reads"],
  ["a matrix value in --filter", MAC, "      - run: pnpm --filter @barkever/${{ matrix.pkg }} test", says("test-mac step 5", "pnpm --filter @barkever/${{ matrix.pkg }} test")],
  ["command exec before the test", SCRIPTS, step(["command exec true && node --test scripts/*.test.mjs"]), says("test-scripts step 5", "command exec true")],
  ["builtin exit 0 before the test", SCRIPTS, step(["builtin exit 0 && node --test scripts/*.test.mjs"]), says("test-scripts step 5", "builtin exit 0")],
  ["hash -p swaps node for true", SCRIPTS, step(["hash -p /usr/bin/true node && node --test scripts/*.test.mjs"]), says("test-scripts step 5", "hash -p /usr/bin/true node")],
  ["shopt turns errexit off", MAC, step(["shopt -u -o errexit", "pnpm --filter @barkever/mac test", "echo done"]), says("test-mac step 5", "shopt -u -o errexit")],
  ["cd away so the glob matches nothing", SCRIPTS, step(["cd /tmp && node --test scripts/*.test.mjs"]), says("test-scripts step 5", "cd /tmp")],
  ["export NODE_OPTIONS before the test", SCRIPTS, step(["export NODE_OPTIONS=--require=./q.cjs && node --test scripts/*.test.mjs"]), says("test-scripts step 5", "export NODE_OPTIONS=--require=./q.cjs")],
  ["roadmap.mjs named as the test runner", SCRIPTS, step(["node scripts/roadmap.mjs --test scripts/*.test.mjs"]), says("test-scripts step 5", "node scripts/roadmap.mjs --test scripts/*.test.mjs")],
  ["node -e 0 named as the test runner", SCRIPTS, step(["node -e 0 --test scripts/*.test.mjs"]), says("test-scripts step 5", "node -e 0 --test scripts/*.test.mjs")],
  ["an earlier step writes GITHUB_ENV", SCRIPTS, `      - run: echo X=--te''st-skip-pattern=. >> "$GITHUB_ENV"\n${SCRIPTS} $X`, says("test-scripts step 5", `echo X=--te''st-skip-pattern=. >> "$GITHUB_ENV"`)],
  ["$X after the test command", SCRIPTS, `${SCRIPTS} $X`, says("test-scripts step 5", `${SCRIPTS_RUN} $X`)],
  ["an unpinned action in a test job", SCRIPTS, `      - uses: actions/checkout@v4\n${SCRIPTS}`, "test-scripts step 5: actions/checkout@v4 is not a pinned action"],
  ["checkout of another ref in a test job", SCRIPTS, `${CHECKOUT}\n        with:\n          ref: elsewhere\n${SCRIPTS}`, "test-scripts step 5: with key ref is not one the check reads"],
  ["PATH in the step env", MAC, `      - env:\n          PATH: /tmp/fake\n        run: pnpm --filter @barkever/mac test`, "test-mac step 5: env key PATH is not one the check reads"],
  ["working-directory on a test step", MAC, `      - working-directory: /tmp\n        run: pnpm --filter @barkever/mac test`, "test-mac step 5: step key working-directory is not one the check reads"],
  ["pnpm install shadowing a script that names tests", SCRIPTS, "      - run: pnpm install", says("test-scripts step 5", "pnpm install"), withFile("package.json", JSON.stringify({ ...JSON.parse(read("package.json")), scripts: { ...JSON.parse(read("package.json")).scripts, install: SCRIPTS_RUN } }))],
  ["a new line in a package script", APP, APP, `test-app step 5: app/package.json test: ${noShape(`${appPackage.scripts.test}\ntrue`)}`, appTest(`${appPackage.scripts.test}\ntrue`)],
  ["cd away in a package script", APP, APP, `test-app step 5: app/package.json test: ${noShape("cd /tmp")}`, appTest(`cd /tmp && ${appPackage.scripts.test}`)],
  ["roadmap.mjs as the runner in a package script", APP, APP, `test-app step 5: app/package.json test: ${noShape(appPackage.scripts.test.replace("own-tmp", "roadmap"))}`, appTest(appPackage.scripts.test.replace("own-tmp", "roadmap"))],
  ["script-shell in .npmrc", APP, APP, ".npmrc: npmrc key script-shell is not one the check reads", withFile(".npmrc", `${read(".npmrc").trimEnd()}\nscript-shell=/usr/bin/true\n`)],
];

for (const [name, from, to, problem, readFile] of PLANTS) {
  test(`plant: ${name}`, () => {
    assert.ok(ci.includes(from), from);
    const problems = notRun(files, ci.replace(from, () => to), readFile);
    assert.ok(problems.includes(problem), JSON.stringify(problems));
  });
}
