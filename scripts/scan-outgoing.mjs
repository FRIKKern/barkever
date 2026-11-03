#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] });
const hasOrigin = () => { try { git(["rev-parse", "--verify", "-q", "origin/main"]); return true; } catch { return false; } };

const secrets = [];
const cfgPath = `${homedir()}/.config/barkpark/config.json`;
if (existsSync(cfgPath)) {
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  const publicDefaults = new Set(["barkpark-dev-token"]);
  for (const t of [cfg.token, cfg.cloud_token, ...(cfg.known_servers ?? []).map((s) => s.token)]) if (t && t.length > 12 && !publicDefaults.has(t)) secrets.push(t);
}
const envPath = new URL("../app/.env.local", import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY|EMAIL)[A-Z0-9_]*\s*=\s*["']?(.*?)["']?\s*$/);
    if (m && m[2].length >= 8) secrets.push(m[2]);
  }
}
const patterns = [/sk-ant-[A-Za-z0-9_-]{20,}/, /sk-proj-[A-Za-z0-9_-]{20,}/, /\bgh[opsur]_[A-Za-z0-9]{30,}/, /\bgithub_pat_[A-Za-z0-9_]{20,}/, /\bbpsess_[A-Za-z0-9_-]{16,}/, /\bxox[abeprs]-[A-Za-z0-9-]{10,}/, /\bnpm_[A-Za-z0-9]{30,}/, /\bAKIA[0-9A-Z]{16}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

const range = process.argv[2] ?? (hasOrigin() ? "origin/main..HEAD" : "HEAD");
const commits = git(["rev-list", range]).split("\n").filter(Boolean);
let bad = 0;
for (const sha of commits) {
  const text = git(["show", "--text", "--format=%B", sha]);
  const literal = secrets.filter((s) => text.includes(s)).length;
  const pattern = patterns.filter((p) => p.test(text)).length;
  if (literal + pattern) { bad++; console.log(`${sha.slice(0, 10)}  ✗ ${literal} known token(s), ${pattern} key pattern(s)`); }
}
if (bad) { console.error(`scan-outgoing: ${bad} commit(s) hold secrets — do not push`); process.exit(1); }
console.log(`scan-outgoing: ok (${commits.length} commit(s), ${secrets.length} known tokens checked)`);
