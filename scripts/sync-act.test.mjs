import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASH, GIT, keyShims } from "./key-shims.mjs";
import { COPIED, sha256, sourceNote } from "./pack.mjs";
import { cleanup } from "./test-cleanup.mjs";

const ACT = fileURLToPath(new URL("sync-act.sh", import.meta.url));
const HELPER = fileURLToPath(new URL("act-token.sh", import.meta.url));
const TOKEN = "the act token";
const top = mkdtempSync(join(tmpdir(), "sync-act-"));
cleanup([top]);
let made = 0;
const tmp = (name) => {
  const dir = join(top, `${name}-${made++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const shim = keyShims(join(tmp("shims"), "bin"), TOKEN);

const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const write = (dir, path, text) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const read = (dir, path) => readFileSync(join(dir, path), "utf8");
const SRC = "api/priv/portable_doc";
const REPORT = "conformance/barkever-blocks.json";
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function bark(w, golden, { branch = "main", extra = {} } = {}) {
  const files = { "conformance/conformance.mjs": "export {}\n", "conformance/conformance.d.mts": "export {};\n", "goldens/blocks/paragraph.golden.json": golden, "goldens/limits/deep.golden.json": "{}\n", ...extra };
  const stamp = { files: Object.fromEntries(Object.entries(files).filter(([f]) => f.startsWith("goldens/")).map(([f, t]) => [f.slice(8), sha256(t)]).sort(([a], [b]) => (a < b ? -1 : 1))) };
  files["goldens/stamp.json"] = json(stamp);
  if (branch !== "main") git(w.barkpark, "checkout", "-q", "-B", branch);
  for (const [f, t] of Object.entries(files)) write(w.barkpark, `${SRC}/${f}`, t);
  git(w.barkpark, "add", "-A");
  git(w.barkpark, "commit", "-q", "--allow-empty", "-m", "pack");
  const at = git(w.barkpark, "rev-parse", "HEAD");
  if (branch !== "main") git(w.barkpark, "checkout", "-q", "main");
  rmSync(join(w.work, "conformance/pack"), { recursive: true, force: true });
  const hashes = {};
  for (const [mine, theirs] of Object.entries(COPIED)) {
    write(w.work, `conformance/pack/${mine}`, files[theirs]);
    hashes[mine] = sha256(files[theirs]);
  }
  const blocks = Object.keys(files).filter((f) => f.startsWith("goldens/blocks/")).sort();
  for (const f of blocks) write(w.work, `conformance/pack/${f}`, files[f]);
  write(w.work, "conformance/pack/SOURCE.md", sourceNote(at, hashes));
  const prior = existsSync(join(w.work, REPORT)) ? JSON.parse(read(w.work, REPORT)) : { renderer: "barkever-blocks", compare: "dom", rows: [{ type: "paragraph", status: "pass" }] };
  const rows = blocks.map((f) => f.slice(15, -12)).map((type) => prior.rows.find((r) => r.type === type) ?? { type, status: "missing" });
  write(w.work, REPORT, json({ renderer: prior.renderer, compare: prior.compare, pack_stamp: sha256(files["goldens/stamp.json"]), ran_at_sha: "a".repeat(40), rows }));
  return at;
}

function world() {
  const base = tmp("world");
  const barkpark = join(base, "barkpark");
  git(base, "init", "-q", "-b", "main", "barkpark");
  git(barkpark, "config", "uploadpack.allowFilter", "true");
  git(base, "init", "-q", "--bare", "-b", "main", "origin.git");
  git(base, "clone", "-q", "origin.git", "work");
  const w = { base, barkpark, origin: join(base, "origin.git"), work: join(base, "work") };
  bark(w, "{\"v\": 1}\n");
  write(w.work, "app/x.ts", "x\n");
  write(w.work, ".github/workflows/ci.yml", "name: ci\n");
  w.staging = commit(w, "staging");
  git(w.work, "push", "-q", "origin", "HEAD:main", "HEAD:staging");
  return w;
}
const commit = (w, message) => (git(w.work, "add", "-A"), git(w.work, "commit", "-q", "-m", message), git(w.work, "rev-parse", "HEAD"));
const stagingAt = (w) => git(w.origin, "rev-parse", "staging");

function plan(w, content, not = [w.staging]) {
  const dir = join(tmp("runner"), "plan");
  mkdirSync(dir);
  writeFileSync(join(dir, "plan.json"), JSON.stringify(content));
  if (content.action === "push" && content.bundle !== false) git(w.work, "bundle", "create", "-q", join(dir, "sync.bundle"), "HEAD", ...not.map((c) => `^${c}`));
  return join(dir, "..");
}

function act(w, runnerTemp, issues = []) {
  const bin = tmp("bin");
  const ghLog = join(bin, "gh.log");
  const tokenLog = join(bin, "token.log");
  writeFileSync(join(bin, "git"), `#!/bin/sh\n${shim.check("git")}\ncase "$(export -p)" in *'${TOKEN}'*) for a in "$@"; do case "$a" in -*|*=*) ;; *) echo "git $a" >> "${tokenLog}"; break ;; esac; done ;; esac\nexec "${GIT}" "$@"\n`);
  writeFileSync(join(bin, "gh"), `#!${process.execPath}
const { appendFileSync, readFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const args = process.argv.slice(2);
if (JSON.stringify(process.env).includes(${JSON.stringify(TOKEN)})) appendFileSync(${JSON.stringify(tokenLog)}, "gh " + args.slice(0, 2).join(" ") + "\\n");
appendFileSync(${JSON.stringify(ghLog)}, args.join(" ") + "\\n");
if (args[0] === "issue" && args[1] === "list") process.stdout.write(execFileSync("jq", ["-r", args[args.indexOf("-q") + 1]], { input: readFileSync(${JSON.stringify(join(bin, "issues.json"))}), encoding: "utf8" }));
if (args[0] === "issue" && args[1] !== "list") appendFileSync(${JSON.stringify(ghLog)}, "body " + readFileSync(args[args.indexOf("--body-file") + 1], "utf8"));
`);
  writeFileSync(join(bin, "issues.json"), JSON.stringify(issues));
  chmodSync(join(bin, "git"), 0o755);
  chmodSync(join(bin, "gh"), 0o755);
  const checkout = join(tmp("checkout"), "repo");
  git(w.base, "clone", "-q", w.origin, checkout);
  const r = spawnSync(BASH, [ACT], { cwd: checkout, encoding: "utf8", env: { ...env, PATH: `${bin}:${shim.dir}`, RUNNER_TEMP: runnerTemp, BARKPARK_GIT: w.barkpark, PUSH_URL: w.origin, GH_REPO: "o/r", ACT_TOKEN: TOKEN } });
  const lines = (path) => (existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean) : []);
  return { status: r.status, err: r.stdout + r.stderr, seen: shim.seen(), token: lines(tokenLog), gh: existsSync(ghLog) ? readFileSync(ghLog, "utf8") : "" };
}

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

test("act pushes the plan's tree onto staging under its own message, then dispatches ci; the token reaches only those two", () => {
  const w = world();
  const at = bark(w, "{\"v\": 2}\n", { extra: { "goldens/blocks/chart.golden.json": "{}\n" } });
  const planned = commit(w, "anything the plan says");
  const r = act(w, plan(w, { action: "push", source: "ignored" }));
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

test("act refuses a sync commit that leaves the pack, is not Barkpark's, forges SOURCE.md or the report, or sits on another staging", () => {
  const refused = (name, change, needle, content = { action: "push" }) => {
    const w = world();
    change(w);
    const r = act(w, plan(w, content));
    assert.equal(r.status, 1, `${name}: ${r.err}`);
    assert.match(r.err, needle, name);
    assert.ok([w.staging, w.moved].includes(stagingAt(w)), `${name}: nothing pushed`);
    assert.deepEqual([r.token, r.seen, r.gh], [[], [], ""], `${name}: the token reached no child, no ci dispatched`);
  };
  const synced = (w) => (bark(w, "{\"v\": 2}\n", { extra: { "goldens/blocks/chart.golden.json": "{}\n", "goldens/blocks/toc.golden.json": "{}\n" } }), w);
  const edit = (w, path, from, to) => {
    const text = read(w.work, path);
    assert.ok(text.includes(from), `${path} holds ${from}`);
    write(w.work, path, text.replace(from, to));
  };
  refused("an app file in the commit", (w) => (synced(w), write(w.work, "app/x.ts", "y\n"), commit(w, "sync")), /M 100644 100644 app\/x\.ts/);
  refused("a workflow moved into the pack", (w) => (synced(w), git(w.work, "mv", ".github/workflows/ci.yml", "conformance/pack/ci.yml"), commit(w, "sync")), /D 100644 000000 \.github\/workflows\/ci\.yml/);
  refused("an executable in the pack", (w) => (synced(w), chmodSync(join(w.work, "conformance/pack/conformance.mjs"), 0o755), commit(w, "sync")), /100755 conformance\/pack\/conformance\.mjs/);
  refused("a pack file not as Barkpark holds it", (w) => (synced(w), write(w.work, "conformance/pack/goldens/blocks/paragraph.golden.json", "{\"v\": 666}\n"), commit(w, "sync")), /the pack differs from Barkpark [0-9a-f]{40}: goldens\/blocks\/paragraph\.golden\.json/);
  refused("a Barkpark file the pack never holds", (w) => (synced(w), write(w.work, "conformance/pack/goldens/limits/deep.golden.json", "{}\n"), commit(w, "sync")), /goldens\/limits\/deep\.golden\.json is never in the pack/);
  refused("a golden the stamp names left out", (w) => (synced(w), rmSync(join(w.work, "conformance/pack/goldens/blocks/toc.golden.json")), commit(w, "sync")), /block goldens are not the ones its stamp names/);
  refused("SOURCE.md prose not as pack-sync writes it", (w) => (synced(w), edit(w, "conformance/pack/SOURCE.md", "Never", "Do"), commit(w, "sync")), /SOURCE\.md is not as pack-sync writes it/);
  refused("a forged SOURCE.md row", (w) => (synced(w), edit(w, "conformance/pack/SOURCE.md", `\`${sha256("export {}\n")}\``, `\`${"a".repeat(64)}\``), commit(w, "sync")), /SOURCE\.md is not as pack-sync writes it for these files/);
  refused("a Barkpark commit off its main", (w) => (bark(w, "{\"v\": 2}\n", { branch: "side" }), commit(w, "sync")), /is not on Barkpark's main/);
  refused("a moved row in the report", (w) => (synced(w), edit(w, REPORT, '"pass"', '"fail"'), commit(w, "sync")), /is not the staging report on the new stamp/);
  refused("a wrong pack_stamp", (w) => (synced(w), edit(w, REPORT, /"pack_stamp": "[0-9a-f]{64}"/.exec(read(w.work, REPORT))[0], `"pack_stamp": "${"b".repeat(64)}"`), commit(w, "sync")), /is not the staging report on the new stamp/);
  refused("an extra missing row", (w) => (synced(w), edit(w, REPORT, '    {\n      "type": "toc"', '    {\n      "type": "zzz",\n      "status": "missing"\n    },\n    {\n      "type": "toc"'), commit(w, "sync")), /is not the staging report on the new stamp/);
  refused("missing rows out of order", (w) => (synced(w), edit(w, REPORT, '"type": "chart",\n      "status": "missing"', '"type": "toc",\n      "status": "missing"'), edit(w, REPORT, '"type": "toc",\n      "status": "missing"\n    }\n  ]', '"type": "chart",\n      "status": "missing"\n    }\n  ]'), commit(w, "sync")), /is not the staging report on the new stamp/);
  refused("a missing row with its keys turned", (w) => (synced(w), edit(w, REPORT, '"type": "chart",\n      "status": "missing"', '"status": "missing",\n      "type": "chart"'), commit(w, "sync")), /not as conformance writes it|is not the staging report on the new stamp/);
  refused("staging moved since the plan", (w) => {
    synced(w);
    commit(w, "sync");
    const other = join(tmp("other"), "repo");
    git(w.base, "clone", "-q", "-b", "staging", w.origin, other);
    write(other, "app/x.ts", "landed meanwhile\n");
    git(other, "commit", "-qam", "a land");
    git(other, "push", "-q", "origin", "HEAD:staging");
    w.moved = git(other, "rev-parse", "HEAD");
  }, /staging moved since the plan, nothing pushed/);
  refused("a plan asking for another action", (w) => (synced(w), commit(w, "sync")), /the plan asks for land: act only pushes or reports/, { action: "land" });
  refused("no valid bundle", (w) => w, /no valid sync\.bundle/, { action: "push", bundle: false });
});

test("act never takes an older pack than staging's", () => {
  const w = world();
  const older = tmp("older");
  cpSync(join(w.work, "conformance"), older, { recursive: true });
  bark(w, "{\"v\": 2}\n");
  w.staging = commit(w, "staging takes a later pack");
  git(w.work, "push", "-q", "origin", "HEAD:staging");
  rmSync(join(w.work, "conformance"), { recursive: true });
  cpSync(older, join(w.work, "conformance"), { recursive: true });
  commit(w, "back to the older pack");
  const r = act(w, plan(w, { action: "push" }));
  assert.equal(r.status, 1, r.err);
  assert.match(r.err, /does not hold [0-9a-f]{40}, the commit staging's SOURCE\.md names: an older pack is never taken/);
  assert.equal(stagingAt(w), w.staging);
});

test("act's report keeps exactly one issue in its own words: the failed checks, the moved rows, the Barkpark commit, the next step", () => {
  const w = world();
  const at = bark(w, "{\"v\": 2}\n");
  const runner = plan(w, { action: "report", source: at, moved: ["paragraph"], failed: ["types", "conformance-test"] });
  const opened = act(w, runner);
  assert.equal(opened.status, 0, opened.err);
  assert.match(opened.gh, /^issue create --title PortableDoc pack sync waits for Barkever --body-file /m);
  const body = opened.gh.slice(opened.gh.indexOf("body ") + 5);
  assert.ok(body.includes(`Barkpark commit \`${at}\``), body);
  assert.match(body, /^- the app's type check \(`tsc --noEmit`\)$/m);
  assert.match(body, /^- the conformance tests \(`conformance\/conformance\.test\.mjs`\)$/m);
  assert.match(body, /^- `paragraph`$/m);
  assert.match(body, /^What to do: on a branch, run `node scripts\/pack-sync\.mjs`/m);
  for (const local of ["/Volumes", "/Users", "/home", "/tmp", tmpdir(), runner, top]) assert.ok(!body.includes(local), `the issue names ${local}`);
  assert.deepEqual(opened.token, ["gh issue list", "gh issue create"], "in a report the token reaches only the issue calls");
  assert.equal(stagingAt(w), w.staging);
  const bot = { is_bot: true, login: "app/github-actions" };
  const title = "PortableDoc pack sync waits for Barkever";
  const issues = [{ number: 7, title, author: { is_bot: false, login: "someone" } }, { number: 9, title, author: bot }, { number: 8, title, author: bot }];
  const updated = act(w, plan(w, { action: "report", source: at, moved: [], failed: ["pack-compare"] }), issues);
  assert.equal(updated.status, 0, updated.err);
  assert.match(updated.gh, /^issue edit 8 --body-file /m);
  assert.doesNotMatch(updated.gh, /^issue create/m);
  for (const [content, needle] of [
    [{ moved: ["no-such-block"], failed: [] }, /no-such-block is no block type/],
    [{ moved: ["a`b"], failed: [] }, /moved type a`b/],
    [{ moved: [], failed: ["rm -rf"] }, /failed check rm -rf/],
    [{ moved: [], failed: [] }, /names no moved rows or failed checks/],
    [{ moved: ["paragraph"] }, /names no moved rows or failed checks/],
    [{ moved: ["paragraph"], failed: [], source: "x".repeat(40) }, /source x+/],
  ]) {
    const r = act(w, plan(w, { action: "report", source: at, ...content }));
    assert.equal(r.status, 1, r.err);
    assert.match(r.err, needle);
    assert.doesNotMatch(r.gh, /^issue (create|edit)/m);
  }
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
