import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { PACK_DIR } from "./pack-door.mjs";
import { BASH } from "./key-shims.mjs";
import { ACT, HELPER, TOKEN, act, bark, commit, env, git, plan, stagingAt, tmp, top, world } from "./sync-act-world.mjs";

describe("sync-act.sh", { concurrency: true }, () => {
  test("sync-act.sh touches the token only through act-token.sh: one push, never forced, and one ci dispatch", () => {
    const code = readFileSync(ACT, "utf8").split("\n");
    assert.equal(code.findIndex((l) => /act-token\.sh/.test(l)), 2, "sourced before anything forks");
    assert.deepEqual(code.filter((l) => /act-token\.sh/.test(l)), ['. "${BASH_SOURCE[0]%/*}/act-token.sh"']);
    assert.deepEqual(code.filter((l) => /token_push|ACT_TOKEN|act_token|GH_TOKEN|git push|--force/.test(l)).map((l) => l.trim()), ['token_push "$sync:refs/heads/staging"']);
    assert.deepEqual(code.filter((l) => /^\s*(token_)?gh\s/.test(l) || /\$\((token_)?gh\s/.test(l)).map((l) => l.trim().split(" ").slice(0, 3).join(" ")), ["number=$(token_gh issue list", "token_gh issue edit", "token_gh issue create", "token_gh workflow run"]);
    const helper = readFileSync(HELPER, "utf8");
    assert.match(helper, /^act_token=\$\{ACT_TOKEN:-\}\nunset ACT_TOKEN$/m);
    assert.doesNotMatch(helper, /--force|\s-f\s|\+\$1|#/);
  });

  test("the act job takes the pack path from the door in one step, and act gets it only from that step", () => {
    const steps = load(readFileSync(new URL("../.github/workflows/sync-pack.yml", import.meta.url), "utf8")).jobs.act.steps;
    const door = steps.find((s) => s.id === "door");
    const out = join(tmp("door"), "output");
    const r = spawnSync(BASH, ["-c", door.run], { cwd: fileURLToPath(new URL("..", import.meta.url)), env: { PATH: process.env.PATH, GITHUB_OUTPUT: out }, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(out, "utf8"), `pack_dir=${PACK_DIR}\n`);
    assert.equal(steps.at(-1).env.PACK_DIR, "${{ steps.door.outputs.pack_dir }}");
    assert.equal(steps.indexOf(door), steps.length - 2);
  });

  test("a push run puts the plan's tree on staging under its own message, and the token reaches git push and gh workflow run, nothing else", async () => {
    const w = world();
    const at = bark(w, "{\"v\": 2}\n", { extra: { "goldens/blocks/chart.golden.json": "{}\n" } });
    const planned = commit(w, "anything the plan says");
    const r = await act(w, plan(w, { action: "push", source: "ignored" }));
    assert.equal(r.status, 0, r.err);
    const head = stagingAt(w);
    assert.equal(git(w.origin, "rev-parse", `${head}^{tree}`), git(w.work, "rev-parse", `${planned}^{tree}`));
    assert.equal(git(w.origin, "rev-parse", `${head}^`), w.staging);
    assert.equal(git(w.origin, "log", "-1", "--format=%s%n%n%b", head).trim(), `PortableDoc pack: sync from Barkpark ${at.slice(0, 12)}\n\nEvery pack file but SOURCE.md is Barkpark's own at ${at}, and no conformance row moved.`);
    assert.equal(git(w.origin, "log", "-1", "--format=%an", head), "github-actions[bot]");
    assert.equal(r.gh, "workflow run ci.yml --ref staging\n");
    assert.deepEqual(r.token, ["git push", "gh workflow run"]);
    assert.deepEqual(r.seen, ["git"], "only the push's own git saw it; jq, the hash tool and every other git saw none");
  });

  test("act never takes an older pack than staging's", async () => {
    const w = world();
    const older = tmp("older");
    cpSync(join(w.work, "conformance"), older, { recursive: true });
    bark(w, "{\"v\": 2}\n");
    w.staging = commit(w, "staging takes a later pack");
    git(w.work, "push", "-q", "origin", "HEAD:staging");
    rmSync(join(w.work, "conformance"), { recursive: true });
    cpSync(older, join(w.work, "conformance"), { recursive: true });
    commit(w, "back to the older pack");
    const r = await act(w, plan(w, { action: "push" }));
    assert.equal(r.status, 1, r.err);
    assert.match(r.err, /does not hold [0-9a-f]{40}, the commit staging's SOURCE\.md names: an older pack is never taken/);
    assert.equal(stagingAt(w), w.staging);
  });

  test("a report run keeps exactly one issue in its own words, and the token reaches gh issue list, create and edit, nothing else", async () => {
    const w = world();
    const at = bark(w, "{\"v\": 2}\n");
    const runner = plan(w, { action: "report", source: at, moved: ["paragraph"], failed: ["conformance", "types", "test:app/x.test.ts"] });
    const bot = { is_bot: true, login: "app/github-actions" };
    const title = "PortableDoc pack sync waits for Barkever";
    const issues = [{ number: 7, title, author: { is_bot: false, login: "someone" } }, { number: 9, title, author: bot }, { number: 8, title, author: bot }];
    const [opened, updated] = await Promise.all([act(w, runner), act(w, plan(w, { action: "report", source: at, moved: [], failed: ["pack-compare"] }), issues)]);
    assert.equal(opened.status, 0, opened.err);
    assert.match(opened.gh, /^issue create --title PortableDoc pack sync waits for Barkever --body-file /m);
    const body = opened.gh.slice(opened.gh.indexOf("body ") + 5);
    assert.ok(body.includes(`Barkpark commit \`${at}\``), body);
    assert.match(body, /^- the conformance run \(`pnpm conformance`\)$/m);
    assert.match(body, /^- the app's type check \(`tsc --noEmit`\)$/m);
    assert.match(body, /^- the tests in `app\/x\.test\.ts`, which read the pack$/m);
    assert.match(body, /^- `paragraph`$/m);
    assert.match(body, /^What to do: on a branch, run `node scripts\/pack-sync\.mjs`/m);
    for (const local of ["/Volumes", "/Users", "/home", "/tmp", tmpdir(), runner, top]) assert.ok(!body.includes(local), `the issue names ${local}`);
    assert.deepEqual(opened.token, ["gh issue list", "gh issue create"], "in a report the token reaches only the issue calls, never a push or a dispatch");
    assert.equal(stagingAt(w), w.staging);
    assert.equal(updated.status, 0, updated.err);
    assert.match(updated.gh, /^issue edit 8 --body-file /m);
    assert.deepEqual(updated.token, ["gh issue list", "gh issue edit"], "an update reaches only list and edit");
    assert.doesNotMatch(updated.gh, /^issue create/m);
    await Promise.all([
      [{ moved: ["no-such-block"], failed: [] }, /no-such-block is no block type/],
      [{ moved: [], failed: ["test:../x.test.ts"] }, /failed check test:\.\.\/x\.test\.ts/],
      [{ moved: ["paragraph"], failed: [], source: "x".repeat(40) }, /source x+/],
    ].map(async ([content, needle]) => {
      const r = await act(w, plan(w, { action: "report", source: at, ...content }));
      assert.equal(r.status, 1, r.err);
      assert.match(r.err, needle);
      assert.doesNotMatch(r.gh, /^issue (create|edit)/m);
    }));
  });

  test("token_push hands GitHub the token as the push's credential, and only when asked", async () => {
    const seen = [];
    const server = createServer((req, res) => {
      seen.push(req.headers.authorization ?? "none");
      if (!req.headers.authorization) res.writeHead(401, { "WWW-Authenticate": 'Basic realm="r"' });
      else res.writeHead(403);
      res.end();
    });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    const repo = tmp("helper");
    git(repo, "init", "-q");
    git(repo, "commit", "-q", "--allow-empty", "-m", "x");
    const run = spawn(BASH, ["-c", `. "${HELPER}"; token_push HEAD:refs/heads/staging`], { cwd: repo, env: { ...env, ACT_TOKEN: TOKEN, PUSH_URL: `http://127.0.0.1:${server.address().port}/o/r.git` } });
    const status = await new Promise((done) => run.on("close", done));
    server.close();
    assert.notEqual(status, 0);
    assert.deepEqual(seen, ["none", `Basic ${Buffer.from(`x-access-token:${TOKEN}`).toString("base64")}`]);
  });
});
