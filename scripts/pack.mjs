import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { PACK_DIR } from "./pack-door.mjs";

export const SOURCE_REPO = "FRIKKern/barkpark";
export const SOURCE_PATH = "api/priv/portable_doc";
export const REPORT = "conformance/barkever-blocks.json";
export const CONFORMANCE_FAILED = 3;
export const COPIED = {
  "conformance.mjs": "conformance/conformance.mjs",
  "conformance.d.mts": "conformance/conformance.d.mts",
  "goldens/stamp.json": "goldens/stamp.json",
};
const BLOCKS = "goldens/blocks";
const STAMP_LINE = `${PACK_DIR}/goldens/stamp.json:`;

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashOf = (path) => sha256(readFileSync(path));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const goldenFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".golden.json")).sort() : []);
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

export const sourceDir = (checkout) => join(checkout, SOURCE_PATH);

export function sourcePack(src) {
  const errors = [];
  const stampPath = join(src, "goldens/stamp.json");
  if (!existsSync(stampPath)) return { files: {}, errors: [`source ${SOURCE_PATH}/goldens/stamp.json: absent, not a PortableDoc pack`] };
  const stamp = readJson(stampPath).files ?? {};
  for (const [file, hash] of Object.entries(stamp)) {
    const path = join(src, "goldens", file);
    if (!existsSync(path)) errors.push(`source goldens/${file}: named in its stamp, absent`);
    else if (hashOf(path) !== hash) errors.push(`source goldens/${file}: differs from its stamp`);
  }
  const blocks = goldenFiles(join(src, BLOCKS));
  for (const f of blocks) if (!(`blocks/${f}` in stamp)) errors.push(`source ${BLOCKS}/${f}: not in its stamp`);
  if (blocks.length === 0) errors.push(`source ${BLOCKS}: no block goldens`);
  const files = {};
  for (const f of blocks) files[`${BLOCKS}/${f}`] = stamp[`blocks/${f}`];
  for (const [mine, theirs] of Object.entries(COPIED)) {
    const path = join(src, theirs);
    if (existsSync(path)) files[mine] = hashOf(path);
    else errors.push(`source ${theirs}: absent`);
  }
  return { files: sorted(files), errors };
}

function ignored(root) {
  const r = spawnSync("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "--", PACK_DIR], { cwd: root, encoding: "utf8" });
  return new Set(r.status === 0 ? r.stdout.split("\n").filter(Boolean).map((f) => f.slice(PACK_DIR.length + 1)) : []);
}

export function heldPack(root) {
  const files = {};
  const skip = ignored(root);
  const walk = (rel) => {
    const dir = join(root, PACK_DIR, rel);
    if (!existsSync(dir)) return;
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const f = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) walk(f);
      else if (f !== "SOURCE.md" && !skip.has(f)) files[f] = hashOf(join(dir, d.name));
    }
  };
  walk("");
  return sorted(files);
}

export function diff(mine, theirs) {
  const names = (o) => Object.keys(o).sort();
  return {
    added: names(theirs).filter((f) => !(f in mine)),
    changed: names(theirs).filter((f) => f in mine && mine[f] !== theirs[f]),
    removed: names(mine).filter((f) => !(f in theirs)),
  };
}

export function compare(root, src) {
  const source = sourcePack(src);
  if (source.errors.length) return source.errors;
  const d = diff(heldPack(root), source.files);
  return ["added", "changed", "removed"].flatMap((kind) => d[kind].map((f) => `${PACK_DIR}/${f}: ${kind} in Barkpark`));
}

export function sourceNote(commit, files) {
  const rows = Object.keys(COPIED).map((f) => `| \`${f}\` | \`${files[f]}\` |`);
  return `# PortableDoc conformance pack

Written by \`scripts/pack-sync.mjs\` from \`${SOURCE_REPO}\` commit \`${commit}\`, path \`${SOURCE_PATH}\`.
Never edit it by hand: Barkpark is the source, and \`.github/workflows/sync-pack.yml\` brings it here.

| File | sha256 |
|---|---|
${rows.join("\n")}

The block goldens are named, with their sha256, in \`goldens/stamp.json\`.
`;
}

export function readSourceNote(root) {
  const path = join(root, PACK_DIR, "SOURCE.md");
  if (!existsSync(path)) return { commit: undefined, files: {} };
  const text = readFileSync(path, "utf8");
  const files = {};
  for (const [, f, hash] of text.matchAll(/^\| `([^`]+)` \| `([0-9a-f]{64})` \|$/gm)) files[f] = hash;
  const commit = text.match(/commit `([0-9a-f]{40})`/)?.[1];
  return { commit, files, written: commit !== undefined && text === sourceNote(commit, files) };
}

export function selfCheck(root) {
  const errors = [];
  const held = heldPack(root);
  const note = readSourceNote(root);
  if (!note.commit) errors.push(`${PACK_DIR}/SOURCE.md: names no Barkpark commit`);
  else if (!note.written) errors.push(`${PACK_DIR}/SOURCE.md: not as the sync wrote it`);
  const stamp = held["goldens/stamp.json"] ? readJson(join(root, PACK_DIR, "goldens/stamp.json")).files ?? {} : {};
  const expected = {};
  for (const [f, hash] of Object.entries(stamp)) if (f.startsWith("blocks/")) expected[`goldens/${f}`] = hash;
  for (const f of Object.keys(COPIED)) expected[f] = note.files[f];
  const d = diff(held, expected);
  for (const f of d.added) errors.push(`${PACK_DIR}/${f}: named by the pack, absent`);
  for (const f of d.changed) errors.push(`${PACK_DIR}/${f}: not as the sync wrote it`);
  for (const f of d.removed) errors.push(`${PACK_DIR}/${f}: not named by the stamp or SOURCE.md`);
  return errors;
}

export function rowsMoved(committed, report) {
  const before = new Map(committed.rows.map((r) => [r.type, r]));
  const now = new Map(report.rows.map((r) => [r.type, r]));
  const moved = [];
  for (const type of [...new Set([...before.keys(), ...now.keys()])].sort()) {
    const a = before.get(type);
    const b = now.get(type);
    if ((a?.status ?? "missing") === "missing" && (b?.status ?? "missing") === "missing") continue;
    if (JSON.stringify(a) !== JSON.stringify(b)) moved.push({ type, line: `row ${type}: committed ${JSON.stringify(a) ?? "absent"}, now ${JSON.stringify(b) ?? "absent"}` });
  }
  return moved;
}

export function decide({ lines, held, source, contains, moved, failed = [] }) {
  const bad = lines.filter((l) => l.startsWith("source "));
  if (bad.length) return { refuse: `Barkpark's pack is at odds with its own stamp, nothing taken:\n${bad.join("\n")}` };
  if (!held) return { refuse: `${PACK_DIR}/SOURCE.md names no Barkpark commit: sync by hand once` };
  if (!contains) return { refuse: `Barkpark ${source} does not hold ${held}, the commit ${PACK_DIR}/SOURCE.md names: an older pack is never taken` };
  const real = lines.filter((l) => !l.startsWith(STAMP_LINE));
  if (real.length === 0) return { action: "none", why: lines.length ? "only the stamp differs from Barkpark; it rides along with the next real change" : "same as Barkpark" };
  if (moved === undefined) return { action: "sync", why: real.join("\n") };
  if (moved.length || failed.length) return { action: "report", why: [...failed.map((f) => `check ${f} fails on the new pack`), ...moved.map((m) => m.line)].join("\n") };
  return { action: "push", why: real.join("\n") };
}

export const DOOR = "scripts/pack-door.mjs";
const DOOR_FILES = new Set([DOOR, "scripts/pack-door.d.mts"]);
export const PACK_NAME_ALLOWED = {
  ".gitleaks.toml": "gitleaks matches the stamp's hashes by path and cannot import the door",
};
const RUNS = /\.(m?[jt]sx?|c[jt]s|sh|bash|zsh|py|ya?ml|json|toml)$/;
const [PACK_PARENT, PACK_NAME] = PACK_DIR.split("/");
const GLUE = String.raw`(?:[\s'"\x60,+/\\$\{\}()]|\bpath\.sep\b|\bsep\b)`;
const PACK_TOKENS = new RegExp(String.raw`\b${PACK_PARENT}\b(${GLUE}{1,80}?)\b${PACK_NAME}\b`, "g");
const RELATIVE = /^\.{1,2}\/[\w./@-]*$/;

export function packNameProblems(file, text) {
  if (DOOR_FILES.has(file) || file.startsWith(`${PACK_DIR}/`) || !(RUNS.test(file) || text.startsWith("#!"))) return [];
  const reachesPack = (literal) => {
    if (!RELATIVE.test(literal)) return false;
    const to = posix.normalize(posix.join(posix.dirname(file), literal));
    return to === PACK_DIR || to.startsWith(`${PACK_DIR}/`);
  };
  const lines = new Set();
  for (const m of text.matchAll(PACK_TOKENS)) if (/\S/.test(m[1])) lines.add(text.slice(0, m.index).split("\n").length);
  text.split("\n").forEach((line, i) => {
    if ([...line.matchAll(/["'`]([^"'`]*)["'`]/g)].some(([, literal]) => reachesPack(literal))) lines.add(i + 1);
  });
  return [...lines].sort((a, b) => a - b).map((n) => `${file}:${n}: names the pack folder; only ${DOOR} may, so import PACK_DIR, PACK_PATH or the helper from it`);
}

export function packNameCheck(files, read) {
  const problems = [];
  for (const file of files) {
    const found = packNameProblems(file, read(file));
    if (!PACK_NAME_ALLOWED[file]) problems.push(...found);
    else if (!found.length) problems.push(`${file}: allowed to name the pack folder (${PACK_NAME_ALLOWED[file]}) but no longer does; drop it from PACK_NAME_ALLOWED in scripts/pack.mjs`);
  }
  for (const file of Object.keys(PACK_NAME_ALLOWED)) if (!files.includes(file)) problems.push(`${file}: allowed to name the pack folder but gone; drop it from PACK_NAME_ALLOWED in scripts/pack.mjs`);
  return problems;
}

const IMPORT = /\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bimport\s+["']([^"']+)["']/g;
const TRIES = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.mjs", "/index.js"];

function localImports(root, file) {
  const text = readFileSync(join(root, file), "utf8");
  return [...text.matchAll(IMPORT)]
    .map((m) => m[1] ?? m[2] ?? m[3])
    .filter((spec) => spec.startsWith("./") || spec.startsWith("../"))
    .map((spec) => posix.normalize(posix.join(posix.dirname(file), spec)))
    .map((to) => TRIES.map((t) => to + t).find((f) => existsSync(join(root, f)) && statSync(join(root, f)).isFile()))
    .filter(Boolean);
}

function reaches(root, file, target, seen = new Set()) {
  if (file === target) return true;
  if (seen.has(file)) return false;
  seen.add(file);
  return localImports(root, file).some((f) => reaches(root, f, target, seen));
}

export function packReaders(root) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.test.mjs", "*.test.js", "*.test.ts", "*.test.tsx"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && existsSync(join(root, f)) && reaches(root, f, DOOR) && !reaches(root, f, "scripts/pack-plan.mjs"))
    .sort();
}
