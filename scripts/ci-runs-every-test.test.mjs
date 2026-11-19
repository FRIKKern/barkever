import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const scripts = (dir) => JSON.parse(read(`${dir}package.json`)).scripts;

export const NOT_IN_CI = {
  "app/e2e/j10/j10.test.ts": "J10 signs in to the live server, and ci holds no session",
};

function globs(text, dir, seen = new Set()) {
  const found = [...text.matchAll(/(?:^|[\s"'])([\w./*-]*\*[\w./*-]*\.test\.[a-z]+|[\w./-]+\.test\.[a-z]+)(?=$|[\s"'&;])/gm)].map(([, glob]) => dir + glob);
  const runs = [
    ...[...text.matchAll(/pnpm --filter @barkever\/(\w+) (\w+)/g)].map(([, pkg, name]) => [`${pkg}/`, name]),
    ...[...text.matchAll(/\b(?:npm run|pnpm) ([\w:-]+)/g)].map(([, name]) => [dir, name]),
  ];
  for (const [at, name] of runs) {
    const key = at + name;
    const body = scripts(at)?.[name];
    if (seen.has(key) || !body) continue;
    seen.add(key);
    found.push(...globs(body, at, seen));
  }
  return found;
}

const matcher = (glob) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", "[^/]*")}$`);

export function notRun(files, ciText) {
  const run = globs(ciText, "").map(matcher);
  const missed = files.filter((file) => /\.test\.[a-z]+$/.test(file) && !run.some((glob) => glob.test(file)));
  return [
    ...missed.filter((file) => !NOT_IN_CI[file]).map((file) => `${file}: no ci job runs it`),
    ...Object.keys(NOT_IN_CI).filter((file) => !missed.includes(file)).map((file) => `${file}: listed in NOT_IN_CI but ci runs it or it is gone`),
  ];
}

test("ci runs every tracked test file, so a green staging run means every test ran", () => {
  const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  const ci = read(".github/workflows/ci.yml");
  assert.deepEqual(notRun(files, ci), []);
  assert.deepEqual(notRun([...files, "app/src/lib/deep/planted.test.ts", "tools/planted.test.mjs"], ci), ["app/src/lib/deep/planted.test.ts: no ci job runs it", "tools/planted.test.mjs: no ci job runs it"]);
  assert.deepEqual(notRun(files.filter((f) => !f.startsWith("app/e2e/j10/")), ci), ["app/e2e/j10/j10.test.ts: listed in NOT_IN_CI but ci runs it or it is gone"]);
  assert.ok(notRun(files, ci.replace("scripts/*.test.mjs", "scripts/pack.test.mjs")).includes("scripts/promote.test.mjs: no ci job runs it"));
});
