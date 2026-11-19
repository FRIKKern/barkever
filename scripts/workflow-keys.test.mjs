import { test } from "node:test";
import assert from "node:assert/strict";
import { keyProblems, repo } from "./workflow-keys.mjs";

const here = repo();
const withFile = (name, text) => ({ ...here.files, [name]: text });

test("every job in the repo holds no write power, or is pinned with every file it runs", () => {
  assert.deepEqual(keyProblems(here.files, here.pins, here.read), []);
  assert.deepEqual(here.pins.jobs.map((p) => p.job).sort(), ["promote.yml promote", "sync-pack.yml ci", "sync-pack.yml push", "sync-pack.yml report"]);
});

test("a job that may write and is not pinned fails, however its power comes", () => {
  const job = (body) => `on: push\npermissions:\n  contents: read\njobs:\n  sneak:\n    runs-on: ubuntu-latest\n${body}`;
  for (const [body, why] of [
    ["    permissions:\n      contents: write\n    steps:\n      - run: git push\n", /its token may write/],
    ["    permissions: write-all\n    steps:\n      - run: echo\n", /its token may write/],
    ["    steps:\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n      - run: git push\n", /checks out without persist-credentials: false/],
    ["    steps:\n      - env: { K: '${{ secrets.DEPLOY_KEY }}' }\n        run: echo\n", /reads secret DEPLOY_KEY/],
    ["    uses: someone/else/.github/workflows/x.yml@main\n", /calls someone/],
  ]) {
    const problems = keyProblems(withFile("sneak.yml", job(body)), here.pins, here.read);
    assert.equal(problems.length, 1, problems.join("\n"));
    assert.match(problems[0], /^sneak\.yml sneak: holds a key \(.*\) and is not pinned/);
    assert.match(problems[0], why);
  }
});

test("a pinned job fails on an action not named by a full commit SHA, a changed byte in it, or in a file it runs", () => {
  const sync = here.files["sync-pack.yml"];
  const tag = sync.replace("actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093\n        with:\n          name: plan\n          path: ${{ runner.temp }}/plan\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n        with:\n          persist-credentials: false\n      - id: push", "actions/download-artifact@v4\n        with:\n          name: plan\n          path: ${{ runner.temp }}/plan\n      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n        with:\n          persist-credentials: false\n      - id: push");
  assert.notEqual(tag, sync);
  assert.ok(keyProblems(withFile("sync-pack.yml", tag), here.pins, here.read).includes("sync-pack.yml push: uses actions/download-artifact@v4, not a full commit SHA"));
  const step = sync.replace("run: bash scripts/sync-act.sh push", "run: bash scripts/sync-act.sh push; git push");
  assert.match(keyProblems(withFile("sync-pack.yml", step), here.pins, here.read).join("\n"), /^sync-pack\.yml push: changed since its pin/m);
  const read = (path) => (path === "scripts/push-token.sh" ? Buffer.concat([here.read(path), Buffer.from(" ")]) : here.read(path));
  const problems = keyProblems(here.files, here.pins, read);
  assert.deepEqual(problems.map((p) => p.replace(/ \(now [0-9a-f]{64}\)$/, "")), ["sync-pack.yml push: scripts/push-token.sh changed since its pin", "sync-pack.yml report: scripts/push-token.sh changed since its pin"]);
});

test("the same YAML written another way keeps its pin; a comment changes nothing", () => {
  const sync = here.files["sync-pack.yml"];
  const restyled = `# a note\n${sync.replace("permissions:\n      contents: write\n", "permissions: { contents: write }\n")}`;
  assert.notEqual(restyled, sync);
  assert.deepEqual(keyProblems(withFile("sync-pack.yml", restyled), here.pins, here.read), []);
});
