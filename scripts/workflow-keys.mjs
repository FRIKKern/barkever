#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

export const DATA_SECRETS = {
  BARKEVER_E2E_EMAIL: "an e2e login on Barkpark; no write to this repo",
  BARKEVER_E2E_PASSWORD: "an e2e login on Barkpark; no write to this repo",
  BARKEVER_E2E_BARKPARK_TOKEN: "a narrow Barkpark token for e2e datasets; no write to this repo",
};
export const PINS = "scripts/keyed-jobs.json";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export function canonical(v, at = "") {
  if (v === null || typeof v === "string" || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x, i) => canonical(x, `${at}[${i}]`)).join(",")}]`;
  if (v && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v)))
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k], `${at}.${k}`)}`).join(",")}}`;
  throw new Error(`${at || "the value"} is ${typeof v === "number" ? v : "not a plain value"}, which this reader refuses`);
}

export const load = (text) => yaml.load(text, { schema: yaml.CORE_SCHEMA });

const LEVELS = new Set(["read", "none"]);
const writes = (p) => !(p === "read-all" || (p && typeof p === "object" && !Array.isArray(p) && Object.values(p).every((v) => LEVELS.has(v))));

function secrets(text) {
  const names = new Set();
  for (let i = text.indexOf("${{"); i >= 0; i = text.indexOf("${{", i + 3)) {
    let end = i;
    while (end < text.length && text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
    const span = text.slice(i, end);
    for (const m of span.matchAll(/secrets/gi)) {
      const rest = span.slice(m.index + m[0].length);
      const name = rest.match(/^\s*\.\s*([A-Za-z_][\w-]*)/)?.[1] ?? rest.match(/^\s*\[\s*'([^']*)'\s*\]/)?.[1];
      names.add(name ? name.toUpperCase() : "?");
    }
  }
  return names;
}

export function keyReasons(workflow, job) {
  const why = [];
  if (!job || typeof job !== "object" || Array.isArray(job)) return ["not a job this reader knows"];
  if ("uses" in job) why.push(`calls ${job.uses}`);
  const steps = job.steps ?? [];
  if (!Array.isArray(steps)) why.push("steps is not a list");
  else
    for (const [i, step] of steps.entries()) {
      if (!step || typeof step !== "object" || Array.isArray(step)) why.push(`step ${i + 1} is not a mapping`);
      else if (/^actions\/checkout@/i.test(String(step.uses ?? "")) && step.with?.["persist-credentials"] !== false) why.push(`step ${i + 1} checks out without persist-credentials: false`);
    }
  const permissions = "permissions" in job ? job.permissions : workflow.permissions;
  if (writes(permissions)) why.push(`its token may write (permissions: ${JSON.stringify(permissions ?? "the repo default")})`);
  let text;
  try {
    text = canonical({ job, env: workflow.env ?? null, defaults: workflow.defaults ?? null });
  } catch (e) {
    return [...why, e.message];
  }
  for (const name of secrets(text)) if (!(name in DATA_SECRETS)) why.push(`reads secret ${name}`);
  return why;
}

const unpinnedUses = (job) => [job.uses, ...(Array.isArray(job.steps) ? job.steps.map((s) => s?.uses) : [])].filter((u) => u !== undefined && !/^[^@\s]+@[0-9a-f]{40}$/.test(String(u)));

export function jobHash(workflow, name) {
  const { jobs, ...own } = workflow;
  return sha256(canonical({ workflow: own, job: jobs[name] }));
}

export function keyProblems(files, pins, read) {
  const out = [];
  const pinned = new Map(pins.jobs.map((p) => [p.job, p]));
  const seen = new Set();
  for (const [file, text] of Object.entries(files)) {
    let workflow;
    try {
      workflow = load(text);
    } catch (e) {
      out.push(`${file}: not parsed (${e.reason ?? e.message})`);
      continue;
    }
    if (!workflow?.jobs || typeof workflow.jobs !== "object") {
      out.push(`${file}: no jobs this reader knows`);
      continue;
    }
    for (const name of Object.keys(workflow.jobs)) {
      const id = `${file} ${name}`;
      const why = keyReasons(workflow, workflow.jobs[name]);
      const pin = pinned.get(id);
      seen.add(id);
      if (!why.length) {
        if (pin) out.push(`${id}: holds no key; drop its pin`);
        continue;
      }
      if (!pin) {
        out.push(`${id}: holds a key (${why.join("; ")}) and is not pinned in ${PINS}`);
        continue;
      }
      for (const u of unpinnedUses(workflow.jobs[name])) out.push(`${id}: uses ${u}, not a full commit SHA`);
      let hash;
      try {
        hash = jobHash(workflow, name);
      } catch (e) {
        out.push(`${id}: ${e.message}`);
        continue;
      }
      if (hash !== pin.sha256) out.push(`${id}: changed since its pin (now ${hash})`);
      for (const [path, want] of Object.entries(pin.runs)) {
        let bytes;
        try {
          bytes = read(path);
        } catch {
          out.push(`${id}: runs ${path}, which is gone`);
          continue;
        }
        if (sha256(bytes) !== want) out.push(`${id}: ${path} changed since its pin (now ${sha256(bytes)})`);
      }
    }
  }
  for (const id of pinned.keys()) if (!seen.has(id)) out.push(`${id}: pinned, but no such job`);
  return out;
}

const root = fileURLToPath(new URL("..", import.meta.url));
export const repo = () => {
  const dir = join(root, ".github/workflows");
  const files = Object.fromEntries(readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort().map((f) => [f, readFileSync(join(dir, f), "utf8")]));
  return { files, pins: JSON.parse(readFileSync(join(root, PINS), "utf8")), read: (path) => readFileSync(join(root, path)) };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { files, pins, read } = repo();
  if (process.argv[2] === "--pin") {
    for (const pin of pins.jobs) {
      const [file, name] = pin.job.split(" ");
      pin.sha256 = jobHash(load(files[file]), name);
      for (const path of Object.keys(pin.runs)) pin.runs[path] = sha256(read(path));
    }
    writeFileSync(join(root, PINS), `${JSON.stringify(pins, null, 2)}\n`);
  }
  const problems = keyProblems(files, pins, read);
  if (problems.length) {
    console.error(`workflow-keys: every job holds no write power, or is pinned with the files it runs in ${PINS}:\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log(`workflow-keys: ${Object.keys(files).length} workflows, ${pins.jobs.length} pinned jobs as reviewed`);
}
