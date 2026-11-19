import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASH, GIT, keyShims } from "./key-shims.mjs";
import { COPIED, sha256, sourceNote } from "./pack.mjs";
import { PACK_DIR } from "./pack-door.mjs";
import { cleanup } from "./test-cleanup.mjs";

export const ACT = fileURLToPath(new URL("sync-act.sh", import.meta.url));
export const HELPER = fileURLToPath(new URL("act-token.sh", import.meta.url));
export const TOKEN = "the act token";
export const top = mkdtempSync(join(tmpdir(), "sync-act-"));
cleanup([top]);
let made = 0;
export const tmp = (name) => {
  const dir = join(top, `${name}-${made++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

export const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
export const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
export const write = (dir, path, text) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};
export const read = (dir, path) => readFileSync(join(dir, path), "utf8");
export const SRC = "api/priv/portable_doc";
export const REPORT = "conformance/barkever-blocks.json";
export const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function bark(w, golden, { branch = "main", extra = {} } = {}) {
  const files = { "conformance/conformance.mjs": "export {}\n", "conformance/conformance.d.mts": "export {};\n", "goldens/blocks/paragraph.golden.json": golden, "goldens/limits/deep.golden.json": "{}\n", ...extra };
  const stamp = { files: Object.fromEntries(Object.entries(files).filter(([f]) => f.startsWith("goldens/")).map(([f, t]) => [f.slice(8), sha256(t)]).sort(([a], [b]) => (a < b ? -1 : 1))) };
  files["goldens/stamp.json"] = json(stamp);
  if (branch !== "main") git(w.barkpark, "checkout", "-q", "-B", branch);
  for (const [f, t] of Object.entries(files)) write(w.barkpark, `${SRC}/${f}`, t);
  git(w.barkpark, "add", "-A");
  git(w.barkpark, "commit", "-q", "--allow-empty", "-m", "pack");
  const at = git(w.barkpark, "rev-parse", "HEAD");
  if (branch !== "main") git(w.barkpark, "checkout", "-q", "main");
  rmSync(join(w.work, PACK_DIR), { recursive: true, force: true });
  const hashes = {};
  for (const [mine, theirs] of Object.entries(COPIED)) {
    write(w.work, `${PACK_DIR}/${mine}`, files[theirs]);
    hashes[mine] = sha256(files[theirs]);
  }
  const blocks = Object.keys(files).filter((f) => f.startsWith("goldens/blocks/")).sort();
  for (const f of blocks) write(w.work, `${PACK_DIR}/${f}`, files[f]);
  write(w.work, `${PACK_DIR}/SOURCE.md`, sourceNote(at, hashes));
  const prior = existsSync(join(w.work, REPORT)) ? JSON.parse(read(w.work, REPORT)) : { renderer: "barkever-blocks", compare: "dom", rows: [{ type: "paragraph", status: "pass" }] };
  const rows = blocks.map((f) => f.slice(15, -12)).map((type) => prior.rows.find((r) => r.type === type) ?? { type, status: "missing" });
  write(w.work, REPORT, json({ renderer: prior.renderer, compare: prior.compare, pack_stamp: sha256(files["goldens/stamp.json"]), ran_at_sha: "a".repeat(40), rows }));
  return at;
}

let template;
export function world() {
  template ??= newWorld();
  const base = tmp("world");
  cpSync(template.base, base, { recursive: true });
  const w = { base, barkpark: join(base, "barkpark"), origin: join(base, "origin.git"), work: join(base, "work"), staging: template.staging };
  git(w.work, "remote", "set-url", "origin", w.origin);
  return w;
}

function newWorld() {
  const base = tmp("template");
  const barkpark = join(base, "barkpark");
  git(base, "init", "-q", "-b", "main", "barkpark");
  git(barkpark, "config", "uploadpack.allowFilter", "true");
  git(base, "init", "-q", "--bare", "-b", "main", "origin.git");
  git(base, "clone", "-q", "origin.git", "work");
  const w = { base, barkpark, origin: join(base, "origin.git"), work: join(base, "work") };
  bark(w, "{\"v\": 1}\n");
  write(w.work, "app/x.ts", "x\n");
  write(w.work, "app/x.test.ts", "x\n");
  write(w.work, ".github/workflows/ci.yml", "name: ci\n");
  w.staging = commit(w, "staging");
  git(w.work, "push", "-q", "origin", "HEAD:main", "HEAD:staging");
  return w;
}
export const commit = (w, message) => (git(w.work, "add", "-A"), git(w.work, "commit", "-q", "-m", message), git(w.work, "rev-parse", "HEAD"));
export const stagingAt = (w) => git(w.origin, "rev-parse", "staging");

export function plan(w, content, not = [w.staging]) {
  const dir = join(tmp("runner"), "plan");
  mkdirSync(dir);
  writeFileSync(join(dir, "plan.json"), JSON.stringify(content));
  if (content.action === "push" && content.bundle !== false) git(w.work, "bundle", "create", "-q", join(dir, "sync.bundle"), "HEAD", ...not.map((c) => `^${c}`));
  return join(dir, "..");
}

export function act(w, runnerTemp, issues = []) {
  const shim = keyShims(join(tmp("shims"), "bin"), TOKEN);
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
  const run = spawn(BASH, [ACT], { cwd: checkout, env: { ...env, PATH: `${bin}:${shim.dir}`, RUNNER_TEMP: runnerTemp, BARKPARK_GIT: w.barkpark, PUSH_URL: w.origin, GH_REPO: "o/r", ACT_TOKEN: TOKEN } });
  let err = "";
  run.stdout.on("data", (d) => (err += d));
  run.stderr.on("data", (d) => (err += d));
  const lines = (path) => (existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean) : []);
  return new Promise((done) => run.on("close", (status) => done({ status, err, seen: shim.seen(), token: lines(tokenLog), gh: existsSync(ghLog) ? readFileSync(ghLog, "utf8") : "" })));
}

