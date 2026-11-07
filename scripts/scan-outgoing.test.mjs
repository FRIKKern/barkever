import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup } from "./test-cleanup.mjs";

const root = new URL("..", import.meta.url).pathname;
const { GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, ...inherited } = process.env;
const env = { ...inherited, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const tops = [];
cleanup(() => { for (const top of tops) rmSync(top, { recursive: true, force: true }); });
const long = "A1b2C3d4".repeat(5);
const known = "known-value-".concat(long);
const knownMail = "owner-".concat(long, "@example.test");

function outgoing(commit, envLocal = `export X_TOKEN=${known}\nBARKEVER_E2E_EMAIL=${knownMail}\n`) {
  const top = mkdtempSync(join(tmpdir(), "scan-"));
  tops.push(top);
  const origin = join(top, "origin.git");
  const repo = join(top, "repo");
  const git = (...args) => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" }).trim();
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin], { env });
  execFileSync("git", ["init", "-q", "-b", "main", repo], { env });
  mkdirSync(join(repo, "scripts"));
  mkdirSync(join(repo, "app"));
  for (const f of ["scan-outgoing.mjs", "secrets.mjs"]) cpSync(join(root, "scripts", f), join(repo, "scripts", f));
  writeFileSync(join(repo, "app/.env.local"), envLocal);
  writeFileSync(join(repo, ".gitignore"), "app/.env.local\n");
  git("add", ".");
  git("commit", "-qm", "base");
  git("remote", "add", "origin", origin);
  git("push", "-q", "origin", "main");
  commit(repo, git);
  return spawnSync("node", ["scripts/scan-outgoing.mjs"], { cwd: repo, env: { ...env, HOME: top }, encoding: "utf8" });
}
const file = (name, text, attrs) => (repo, git) => {
  if (attrs) writeFileSync(join(repo, ".gitattributes"), attrs);
  writeFileSync(join(repo, name), text);
  git("add", ".");
  git("commit", "-qm", "add");
};

const caught = {
  "a known value in a diff": [file("a.txt", known), known],
  "a known value in a message": [(_, git) => git("commit", "-q", "--allow-empty", "-m", `oops ${known}`), known],
  "a known value in a file with a NUL byte": [file("a.bin", `\0\0${known}\0`), known],
  "a known value in a file marked -diff": [file("a.txt", known, "a.txt -diff\n"), known],
  "the login email": [file("a.txt", knownMail), knownMail],
  gho_: [file("a.txt", "gho_".concat(long)), "gho_".concat(long)],
  bpsess_: [file("a.txt", "bpsess_".concat(long)), "bpsess_".concat(long)],
  "xoxb-": [file("a.txt", "xoxb-".concat(long)), "xoxb-".concat(long)],
  npm_: [file("a.txt", "npm_".concat(long)), "npm_".concat(long)],
};
for (const [name, [commit, secret]] of Object.entries(caught)) test(`catches ${name} and never prints it`, () => {
  const r = outgoing(commit);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(!(r.stdout + r.stderr).includes(secret));
});

test("clean commits pass and name how many tokens were checked", () => {
  const r = outgoing(file("a.txt", "just words\n"));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /ok \(1 commit\(s\), 2 known tokens checked\)/);
});
