import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { packNameProblems } from "./pack.mjs";
import { PACK_DIR } from "./pack-door.mjs";
import { defaultChecks } from "./pack-plan.mjs";
import { promote } from "./promote-world.mjs";
import { act, bark, commit, git, plan, stagingAt, tmp, world, write } from "./sync-act-world.mjs";

const READER = "scripts/golden-reader.test.mjs";
const [parent, name] = PACK_DIR.split("/");
const reader = `import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const parent = "${parent}";
const name = "${name}";
test("the paragraph golden is version 1", () => {
  const golden = new URL(\`../\${parent}/\${name}/goldens/blocks/paragraph.golden.json\`, import.meta.url);
  assert.equal(JSON.parse(readFileSync(golden, "utf8")).v, 1);
});
`;

test("a broken pack that slips past the plan's checks turns staging red, main stays, and one issue names the red check", async () => {
  const w = world();
  write(w.work, READER, reader);
  w.staging = commit(w, "a test that reads the pack without the door");
  git(w.work, "push", "-q", "origin", "HEAD:staging");
  const main = git(w.origin, "rev-parse", "main");

  assert.deepEqual(packNameProblems(READER, reader), [], "wall 1, the name check, does not see two separate consts");
  assert.ok(!(`test:${READER}` in defaultChecks(w.work)), "so the plan does not run this reader");

  bark(w, "{\"v\": 2}\n");
  commit(w, "sync");
  const pushed = await act(w, plan(w, { action: "push" }));
  assert.equal(pushed.status, 0, pushed.err);
  const head = stagingAt(w);
  assert.notEqual(head, w.staging, "act pushed the broken pack to staging");
  assert.equal(pushed.gh, "workflow run ci.yml --ref staging\n", "and dispatched ci on it");

  const ci = join(tmp("ci"), "staging");
  git(w.base, "clone", "-q", "-b", "staging", w.origin, ci);
  const ciEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT"));
  const scriptTests = readdirSync(join(ci, "scripts")).filter((f) => f.endsWith(".test.mjs")).map((f) => `scripts/${f}`);
  assert.deepEqual(scriptTests, [READER]);
  const run = spawnSync(process.execPath, ["--test", ...scriptTests], { cwd: ci, env: ciEnv, encoding: "utf8" });
  assert.notEqual(run.status, 0, "ci's test-scripts job runs every scripts test on the pushed head, and this one fails");
  assert.match(run.stdout, /not ok 1 - the paragraph golden is version 1/);
  const jobs = [{ name: "check", conclusion: "success" }, { name: "test-scripts", conclusion: "failure" }];

  const promoted = promote("failure", { staging: head, issues: [], jobs, compare: { [`main...${head}`]: "ahead" } }, { SHA: head });
  assert.equal(promoted.status, 0, promoted.out);
  assert.deepEqual(promoted.calls, ["create staging is red"], "promote does not move main; it opens one issue");
  assert.equal(git(w.origin, "rev-parse", "main"), main, "main did not move");
  const [body] = promoted.bodies;
  assert.match(body, new RegExp(`^ci ended as failure on \`${head}\`, so main stays where it is\\.$`, "m"));
  assert.match(body, /^Checks that failed:\n- the script tests \(`test-scripts`\)$/m);
  for (const local of ["/Volumes", "/Users", "/home", "/tmp", tmpdir(), w.base]) assert.ok(!body.includes(local), `the issue names ${local}`);
});
