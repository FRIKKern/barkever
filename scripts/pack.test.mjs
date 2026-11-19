import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COPIED, compare, decide, PACK_NAME_ALLOWED, PACK_NAME_KINDS, packNameCheck, packNameProblems, packReaders, readSourceNote, rowsMoved, selfCheck, sha256, sourceNote } from "./pack.mjs";
import { PACK_DIR } from "./pack-door.mjs";
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
    write(root, `${PACK_DIR}/${mine}`, src.files[theirs]);
    hashes[mine] = sha256(src.files[theirs]);
  }
  for (const f of Object.keys(src.files).filter((f) => f.startsWith("goldens/blocks/"))) write(root, `${PACK_DIR}/${f}`, src.files[f]);
  write(root, `${PACK_DIR}/SOURCE.md`, sourceNote(COMMIT, hashes));
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
  assert.deepEqual(plan(real), { action: "sync", why: `${PACK_DIR}/goldens/blocks/paragraph.golden.json: changed in Barkpark` });
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
  assert.match(decide({ lines: compare(root, later.dir), held: COMMIT, source: "d".repeat(40), contains: false }).refuse, /does not hold c{40}, the commit \S+\/SOURCE\.md names: an older pack is never taken/);
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
  broken((r) => write(r, `${PACK_DIR}/goldens/blocks/extra.golden.json`, "{}\n"), /goldens\/blocks\/extra\.golden\.json: not named by the stamp or SOURCE\.md/);
  broken((r) => write(r, `${PACK_DIR}/notes.txt`, "x\n"), /\/notes\.txt: not named/);
  broken((r) => write(r, `${PACK_DIR}/conformance.d.mts`, "export type X = 1\n"), /conformance\.d\.mts: not as the sync wrote it/);
  broken((r) => write(r, `${PACK_DIR}/goldens/stamp.json`, json({ files: { "blocks/paragraph.golden.json": sha256("{\"v\": 2}\n") } })), /goldens\/blocks\/paragraph\.golden\.json: not as the sync wrote it\n.*goldens\/stamp\.json: not as the sync wrote it/);
  broken((r) => write(r, `${PACK_DIR}/SOURCE.md`, `Barkpark ${COMMIT}\n`), /SOURCE\.md: names no Barkpark commit/);
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL("pack-compare.mjs", import.meta.url))], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /^pack-compare: \S+: \d+ files as synced from Barkpark [0-9a-f]{12}$/m);
});

test("a row moves when its verdict changes; a type Barkever never rendered may come and go", () => {
  const report = (rows) => ({ renderer: "barkever-blocks", compare: "dom", rows });
  const before = report([{ type: "paragraph", status: "fail", diff: ["a"] }, { type: "chart", status: "missing" }]);
  assert.deepEqual(rowsMoved(before, report([{ type: "paragraph", status: "fail", diff: ["a"] }, { type: "toc", status: "missing" }])), []);
  assert.deepEqual(rowsMoved(before, report([{ type: "paragraph", status: "pass" }])).map((m) => m.type), ["paragraph"]);
  assert.deepEqual(rowsMoved(before, report([{ type: "paragraph", status: "fail", diff: ["a"] }, { type: "chart", status: "pass" }])).map((m) => m.type), ["chart"]);
});

test("a test reads the pack only through the door: the plan finds it by its imports, a helper's included, and leaves out non-readers and the plan's own test", () => {
  const root = join(top, `readers-${n++}`);
  const files = {
    "scripts/pack-door.mjs": "export const PACK_DIR = 'x';\n",
    "scripts/pack-plan.mjs": "export {};\n",
    "scripts/helper.mjs": "export * from \"./pack-door.mjs\";\n",
    "app/src/ui/x.ts": "export const x = 1;\n",
    "app/src/blocks/new.test.ts": "import { conform } from \"../../../scripts/pack-door.mjs\";\n",
    "app/scripts/via-helper.test.ts": "import {\n  PACK_PATH,\n} from '../../scripts/helper.mjs'\n",
    "scripts/plans.test.mjs": "import { planSync } from \"./pack-plan.mjs\";\nimport { PACK_DIR } from \"./pack-door.mjs\";\n",
    "app/src/ui/other.test.ts": "import { x } from './x';\n",
  };
  for (const [f, t] of Object.entries(files)) write(root, f, t);
  spawnSync("git", ["init", "-q"], { cwd: root });
  assert.deepEqual(packReaders(root), ["app/scripts/via-helper.test.ts", "app/src/blocks/new.test.ts"]);
  assert.deepEqual(packReaders(fileURLToPath(new URL("..", import.meta.url))).filter((f) => f.startsWith("conformance/")), ["conformance/conformance.test.mjs"]);
});

test("only the door names the pack folder: a join of its parts, a path, a URL or a relative import elsewhere is refused", () => {
  const [parent, name] = PACK_DIR.split("/");
  const refused = {
    "app/scripts/golden-fixture.test.ts": `const at = join(root, '${parent}', '${name}', 'goldens', 'blocks')`,
    "scripts/plain.mjs": `const at = "${PACK_DIR}/SOURCE.md";`,
    "app/scripts/url.tsx": `const at = new URL('../../${PACK_DIR}/goldens', import.meta.url)`,
    "scripts/glued.test.mjs": `const at = "${parent}" + "/${name}";`,
    "conformance/near.test.mjs": `import { loadPack } from './${name}/conformance.mjs'`,
    "app/scripts/wrapped.test.ts": `const at = join(\n  root,\n  "${parent}",\n  "${name}",\n)`,
    "app/scripts/sep.test.ts": `const at = "${parent}" + path.sep + "${name}"`,
  };
  for (const [f, t] of Object.entries(refused)) assert.equal(packNameProblems(f, `x\n${t}\n`).length, 1, f);
  assert.match(packNameProblems("scripts/plain.mjs", refused["scripts/plain.mjs"])[0], /^scripts\/plain\.mjs:1: names the pack folder; only scripts\/pack-door\.mjs may/);
  const allowed = {
    "scripts/pack-door.mjs": `export const PACK_DIR = "${PACK_DIR}";`,
    "scripts/prose.mjs": `const title = "PortableDoc ${parent} ${name}";`,
    "README.md": `the ${parent} ${name} is synced`,
    "docs/prose.md": `the ${parent} (${name}) and ${PACK_DIR}/SOURCE.md`,
    [`${PACK_DIR}/conformance.mjs`]: `const at = "${PACK_DIR}";`,
    "scripts/other.mjs": `const at = "${parent}/${name}s";`,
  };
  for (const [f, t] of Object.entries(allowed)) assert.deepEqual(packNameProblems(f, t), [], f);
});

test("the allow-list is pinned: only markdown and .gitleaks.toml may name the pack folder, each with a reason", () => {
  assert.deepEqual(Object.keys(PACK_NAME_KINDS), [".md"]);
  assert.deepEqual(Object.keys(PACK_NAME_ALLOWED), [".gitleaks.toml"]);
  for (const reason of [...Object.values(PACK_NAME_KINDS), ...Object.values(PACK_NAME_ALLOWED)]) assert.match(reason, /\w{3,} \w{3,}/);
});

test("every tracked text file is checked unless its kind is on the allow-list, and an allowed file that stops naming the pack folder is stale", () => {
  assert.equal(packNameProblems("scripts/planted.sh", `pack=${PACK_DIR}\n`).length, 1);
  assert.equal(packNameProblems(".github/workflows/planted.yml", `run: ls ${PACK_DIR}/goldens\n`).length, 1);
  assert.equal(packNameProblems("app/package.json", `"x": "cat ${PACK_DIR}/SOURCE.md"\n`).length, 1);
  const scripts = {
    "mac/test/fake/claude": `#!/usr/bin/env node\nreadFileSync("${PACK_DIR}/SOURCE.md")\n`,
    "scripts/planted.bash": `ls ${PACK_DIR}/goldens\n`,
    "scripts/planted.zsh": `ls ${PACK_DIR}/goldens\n`,
    "scripts/planted.py": `open("${PACK_DIR}/SOURCE.md")\n`,
  };
  const other = {
    "scripts/planted.PY": `open("${PACK_DIR}/SOURCE.md")\n`,
    "scripts/planted.pyw": `open("${PACK_DIR}/SOURCE.md")\n`,
    "scripts/bom": `\uFEFF#!/bin/sh\nls ${PACK_DIR}\n`,
    "scripts/blank": `\n#!/bin/sh\nls ${PACK_DIR}\n`,
    "scripts/planted.xyz": `${PACK_DIR}/goldens\n`,
    "scripts/planted": `see ${PACK_DIR}/SOURCE.md\n`,
    "docs/notes.txt": `see ${PACK_DIR}/goldens\n`,
    "docs/planted.MD": `see ${PACK_DIR}/SOURCE.md\n`,
  };
  for (const [f, t] of Object.entries({ ...scripts, ...other })) assert.equal(packNameProblems(f, t).length, 1, `${f} names the pack folder and its kind is not on the allow-list`);
  assert.deepEqual(packNameProblems("docs/planted.md", `see ${PACK_DIR}/SOURCE.md\n`), [], "markdown is on the allow-list");
  const texts = { ".gitleaks.toml": `paths = ['${PACK_DIR}/goldens/stamp.json']\n`, "docs/decisions/0045-the-pack-syncs-itself.md": `see ${PACK_DIR}/SOURCE.md\n`, "scripts/planted.sh": "echo ok\n" };
  assert.deepEqual(packNameCheck(Object.keys(texts), (f) => texts[f]), []);
  texts[".gitleaks.toml"] = "paths = []\n";
  assert.deepEqual(packNameCheck(Object.keys(texts), (f) => texts[f]), [".gitleaks.toml: allowed to name the pack folder (gitleaks matches the stamp's hashes by path and cannot import the door) but no longer does; drop it from PACK_NAME_ALLOWED in scripts/pack.mjs"]);
  assert.deepEqual(packNameCheck([], () => ""), [".gitleaks.toml: allowed to name the pack folder but gone; drop it from PACK_NAME_ALLOWED in scripts/pack.mjs"]);
});
