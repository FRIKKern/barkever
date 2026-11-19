import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COPIED, compare, decide, packReaders, readSourceNote, rowsMoved, selfCheck, sha256, sourceNote } from "./pack.mjs";
import { cleanup } from "./test-cleanup.mjs";

const top = mkdtempSync(join(tmpdir(), "pack-"));
cleanup([top]);
let n = 0;
const write = (dir, path, text) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const COMMIT = "c".repeat(40);

function source(goldens, { lie } = {}) {
  const dir = join(top, `source-${n++}`);
  const files = { "conformance/conformance.mjs": "export {}\n", "conformance/conformance.d.mts": "export {};\n" };
  for (const [f, t] of Object.entries(goldens)) files[`goldens/${f}`] = t;
  const stamp = { files: Object.fromEntries(Object.entries(goldens).map(([f, t]) => [f, sha256(lie?.[f] ?? t)])) };
  files["goldens/stamp.json"] = json(stamp);
  for (const [f, t] of Object.entries(files)) write(dir, f, t);
  return { dir, files };
}

function held(src) {
  const root = join(top, `held-${n++}`);
  const hashes = {};
  for (const [mine, theirs] of Object.entries(COPIED)) {
    write(root, `conformance/pack/${mine}`, src.files[theirs]);
    hashes[mine] = sha256(src.files[theirs]);
  }
  for (const f of Object.keys(src.files).filter((f) => f.startsWith("goldens/blocks/"))) write(root, `conformance/pack/${f}`, src.files[f]);
  write(root, "conformance/pack/SOURCE.md", sourceNote(COMMIT, hashes));
  return root;
}

const base = { "blocks/paragraph.golden.json": "{\"v\": 1}\n", "limits/deep.golden.json": "{}\n" };

test("the sync plan: same or stamp-only takes nothing, a real change syncs, and moved rows report instead of pushing", () => {
  const was = source(base);
  const root = held(was);
  const plan = (src, more = {}) => decide({ lines: compare(root, src.dir), held: COMMIT, source: "d".repeat(40), contains: true, ...more });
  assert.deepEqual(plan(was), { action: "none", why: "same as Barkpark" });
  assert.equal(plan(source({ ...base, "limits/deep.golden.json": "{\"deeper\": 1}\n" })).action, "none", "a golden Barkever does not hold moves only the stamp");
  const real = source({ ...base, "blocks/paragraph.golden.json": "{\"v\": 2}\n" });
  assert.deepEqual(plan(real), { action: "sync", why: "conformance/pack/goldens/blocks/paragraph.golden.json: changed in Barkpark" });
  assert.equal(plan(real, { moved: [] }).action, "push");
  assert.deepEqual(plan(real, { moved: [], failed: ["types"] }), { action: "report", why: "check types fails on the new pack" });
  assert.deepEqual(plan(real, { moved: [{ type: "paragraph", line: "row paragraph moved" }] }), { action: "report", why: "row paragraph moved" });
  assert.equal(plan(source({ ...base, "blocks/list.golden.json": "[]\n" })).action, "sync", "a new block golden is a real change");
});

test("the sync plan refuses a source at odds with its stamp, an older pack, and a SOURCE.md with no commit", () => {
  const root = held(source(base));
  const lying = source({ ...base, "blocks/paragraph.golden.json": "{\"v\": 2}\n" }, { lie: { "blocks/paragraph.golden.json": "{\"v\": 3}\n" } });
  assert.match(decide({ lines: compare(root, lying.dir), held: COMMIT, source: "d".repeat(40), contains: true }).refuse, /at odds with its own stamp, nothing taken:\nsource goldens\/blocks\/paragraph\.golden\.json: differs from its stamp/);
  const later = source({ ...base, "blocks/paragraph.golden.json": "{\"v\": 2}\n" });
  assert.match(decide({ lines: compare(root, later.dir), held: COMMIT, source: "d".repeat(40), contains: false }).refuse, /does not hold c{40}, the commit conformance\/pack\/SOURCE\.md names: an older pack is never taken/);
  assert.match(decide({ lines: [], held: undefined, contains: false }).refuse, /SOURCE\.md names no Barkpark commit/);
});

test("pack-compare: the pack as the sync wrote it passes; a stray file, a hand edit, or a pack behind its stamp fails", () => {
  const ok = held(source(base));
  assert.deepEqual(selfCheck(ok), []);
  assert.equal(readSourceNote(ok).commit, COMMIT);
  const broken = (change, needle) => {
    const root = held(source(base));
    change(root);
    assert.match(selfCheck(root).join("\n"), needle);
  };
  broken((r) => write(r, "conformance/pack/goldens/blocks/extra.golden.json", "{}\n"), /goldens\/blocks\/extra\.golden\.json: not named by the stamp or SOURCE\.md/);
  broken((r) => write(r, "conformance/pack/notes.txt", "x\n"), /conformance\/pack\/notes\.txt: not named/);
  broken((r) => write(r, "conformance/pack/conformance.d.mts", "export type X = 1\n"), /conformance\.d\.mts: not as the sync wrote it/);
  broken((r) => write(r, "conformance/pack/goldens/stamp.json", json({ files: { "blocks/paragraph.golden.json": sha256("{\"v\": 2}\n") } })), /goldens\/blocks\/paragraph\.golden\.json: not as the sync wrote it\n.*goldens\/stamp\.json: not as the sync wrote it/);
  broken((r) => write(r, "conformance/pack/SOURCE.md", `Barkpark ${COMMIT}\n`), /SOURCE\.md: names no Barkpark commit/);
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL("pack-compare.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /^pack-compare: conformance\/pack: \d+ files as synced from Barkpark [0-9a-f]{12}$/m);
});

test("a row moves when its verdict changes; a type Barkever never rendered may come and go", () => {
  const report = (rows) => ({ renderer: "barkever-blocks", compare: "dom", rows });
  const before = report([{ type: "paragraph", status: "fail", diff: ["a"] }, { type: "chart", status: "missing" }]);
  assert.deepEqual(rowsMoved(before, report([{ type: "paragraph", status: "fail", diff: ["a"] }, { type: "toc", status: "missing" }])), []);
  assert.deepEqual(rowsMoved(before, report([{ type: "paragraph", status: "pass" }])).map((m) => m.type), ["paragraph"]);
  assert.deepEqual(rowsMoved(before, report([{ type: "paragraph", status: "fail", diff: ["a"] }, { type: "chart", status: "pass" }])).map((m) => m.type), ["chart"]);
});

test("the plan finds every test that reads the pack by rule: a new one found, a non-reader and the plan's own test left out", () => {
  const root = join(top, `readers-${n++}`);
  const files = {
    "conformance/conformance.test.mjs": "import { loadPack } from './pack/conformance.mjs'\n",
    "app/src/blocks/new.test.ts": "import { conform } from \"../../../conformance/pack/conformance.mjs\";\n",
    "app/scripts/goldens.test.ts": "const dir = new URL(\"../../conformance/pack/goldens\", import.meta.url);\n",
    "scripts/joined.test.mjs": "const at = join(root, `conformance/pack/${f}`);\n",
    "app/src/ui/other.test.ts": "import { x } from './x';\nconst p = 'conformance/packs';\n",
    "scripts/plans.test.mjs": "import { planSync } from \"./pack-plan.mjs\";\nconst pack = \"conformance/pack\";\n",
    "conformance/pack/conformance.mjs": "export {}\n",
  };
  for (const [f, t] of Object.entries(files)) write(root, f, t);
  spawnSync("git", ["init", "-q"], { cwd: root });
  assert.deepEqual(packReaders(root), ["app/scripts/goldens.test.ts", "app/src/blocks/new.test.ts", "conformance/conformance.test.mjs", "scripts/joined.test.mjs"]);
  assert.ok(packReaders(fileURLToPath(new URL("..", import.meta.url))).includes("conformance/conformance.test.mjs"));
});
