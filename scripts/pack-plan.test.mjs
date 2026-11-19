import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultChecks, planSync } from "./pack-plan.mjs";
import { sourceNote, sourcePack } from "./pack.mjs";
import { PACK_DIR } from "./pack-door.mjs";
import { cleanup } from "./test-cleanup.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const top = mkdtempSync(join(tmpdir(), "pack-plan-"));
cleanup([top]);
const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (dir, path, text) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};
let runs = 0;

function barkever() {
  const dir = join(top, `barkever-${runs++}`);
  const files = git(root, "ls-files", "--cached", "--others", "--exclude-standard", "--", "package.json", "pnpm-workspace.yaml", "scripts", "conformance", "app/package.json", "app/tsconfig.json", "app/scripts", "app/src").split("\n").filter((f) => f && existsSync(join(root, f)) && statSync(join(root, f)).isFile());
  for (const f of files) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    copyFileSync(join(root, f), join(dir, f));
  }
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "barkever");
  for (const d of ["node_modules", "app/node_modules"]) symlinkSync(join(root, d), join(dir, d));
  return dir;
}

function barkpark(here) {
  const dir = join(top, `barkpark-${runs++}`);
  const pack = join(here, PACK_DIR);
  const stamp = JSON.parse(readFileSync(join(pack, "goldens/stamp.json"), "utf8"));
  const blocks = Object.fromEntries(Object.entries(stamp.files).filter(([f]) => f.startsWith("blocks/")));
  for (const f of Object.keys(blocks)) write(dir, `api/priv/portable_doc/goldens/${f}`, readFileSync(join(pack, "goldens", f), "utf8"));
  write(dir, "api/priv/portable_doc/goldens/stamp.json", `${JSON.stringify({ ...stamp, files: blocks }, null, 2)}\n`);
  for (const f of ["conformance.mjs", "conformance.d.mts"]) write(dir, `api/priv/portable_doc/conformance/${f}`, readFileSync(join(pack, f), "utf8"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "pack");
  return dir;
}

const here = barkever();
const bp = barkpark(here);
write(here, `${PACK_DIR}/SOURCE.md`, sourceNote(git(bp, "rev-parse", "HEAD"), sourcePack(join(bp, "api/priv/portable_doc")).files));
git(here, "commit", "-qam", "pack from the fake Barkpark");
const PACK = join(bp, "api/priv/portable_doc/conformance/conformance.mjs");
writeFileSync(PACK, `${readFileSync(PACK, "utf8")}\n`);
git(bp, "commit", "-qam", "a newer pack");

const GREEN = [process.execPath, ["-e", ""]];
const RED = [process.execPath, ["-e", "console.error('the stand-in check is red'); process.exit(1)"]];
const plan = (name, checks, checkout = bp, sync) => {
  const out = join(top, name);
  const summary = join(top, `${name}.md`);
  const r = planSync({ root: here, checkout, out, summary, checks: () => checks, ...(sync ? { sync } : {}) });
  return { ...r, out, summary: existsSync(summary) ? readFileSync(summary, "utf8") : "" };
};

test("the real plan runs check-repo, pack-compare, the app's types and every test that reads the pack", () => {
  assert.deepEqual(Object.keys(defaultChecks(root)), ["check-repo", "pack-compare", "types", "test:conformance/conformance.test.mjs", "test:scripts/check-repo.test.mjs", "test:scripts/pack.test.mjs", "test:scripts/sync-act-refusals.test.mjs", "test:scripts/sync-act.test.mjs"]);
});

test("when every check is green the plan pushes one commit of the new pack", () => {
  const { status, plan: p, out } = plan("green", { "pack-compare": GREEN, "test:conformance/conformance.test.mjs": GREEN });
  assert.deepEqual([status, p], [0, { action: "push", source: git(bp, "rev-parse", "HEAD") }]);
  assert.ok(existsSync(join(out, "sync.bundle")));
});

test("a red check plans a report naming it, and carries no commit", () => {
  const { status, plan: p, out, summary } = plan("red", { "pack-compare": GREEN, "test:conformance/conformance.test.mjs": RED });
  assert.deepEqual([status, p], [0, { action: "report", source: git(bp, "rev-parse", "HEAD"), moved: [], failed: ["test:conformance/conformance.test.mjs"] }]);
  assert.ok(!existsSync(join(out, "sync.bundle")), "a report carries no commit");
  assert.match(summary, /^pack-plan: test:conformance\/conformance\.test\.mjs fails on the new pack:\nthe stand-in check is red$/m);
});

test("a plan that stops says why in the run summary", () => {
  const odd = join(top, "odd");
  git(top, "clone", "-q", bp, odd);
  const golden = git(odd, "ls-files", "api/priv/portable_doc/goldens/blocks").split("\n")[0];
  writeFileSync(join(odd, golden), "{}\n");
  git(odd, "commit", "-qam", "a golden its stamp does not name");
  const { status, summary } = plan("refused", { "pack-compare": GREEN }, odd);
  assert.equal(status, 1);
  assert.match(summary, /^pack-plan: Barkpark's pack is at odds with its own stamp, nothing taken:\nsource goldens\/blocks\/.+: differs from its stamp$/m);
});

test("a pack the conformance run cannot use plans a report naming conformance, and carries no commit", () => {
  const crashed = () => ({ status: 3, stdout: "", stderr: "pack-sync: conformance did not run on the new pack (see above)\n" });
  const { status, plan: p, out, summary } = plan("crashed", { "pack-compare": GREEN }, bp, crashed);
  assert.deepEqual([status, p], [0, { action: "report", source: git(bp, "rev-parse", "HEAD"), moved: [], failed: ["conformance"] }]);
  assert.ok(!existsSync(join(out, "sync.bundle")));
  assert.match(summary, /^pack-plan: conformance fails on the new pack:\npack-sync: conformance did not run/m);
});

test("a check that starts another plan finds it refused, so no plan runs its own checks twice", () => {
  const nested = [process.execPath, ["scripts/pack-plan.mjs", bp, "--out", join(top, "nested")]];
  const { status, plan: p, summary } = plan("outer", { "test:scripts/starts-a-plan.test.mjs": nested });
  assert.deepEqual([status, p.action, p.failed], [0, "report", ["test:scripts/starts-a-plan.test.mjs"]]);
  assert.match(summary, /refused: this plan runs inside another plan's check/);
});
