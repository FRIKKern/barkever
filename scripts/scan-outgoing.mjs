#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

const run = (args) => execFileSync("entire", args, { encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] });

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
    const m = line.match(/^\s*[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY)[A-Z0-9_]*\s*=\s*["']?(.*?)["']?\s*$/);
    if (m && m[2].length >= 8) secrets.push(m[2]);
  }
}
const patterns =[/sk-ant-[A-Za-z0-9_-]{20,}/, /sk-proj-[A-Za-z0-9_-]{20,}/, /\bghp_[A-Za-z0-9]{30,}/, /\bAKIA[0-9A-Z]{16}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

const ids = [...run(["checkpoint", "list", "--outgoing"]).matchAll(/^([0-9A-HJKMNP-TV-Z]{26})\b/gm)].map((m) => m[1]);
let bad = 0;
for (const id of ids) {
  const text = run(["checkpoint", "explain", id, "--transcript"]);
  const literal = secrets.filter((s) => text.includes(s)).length;
  const pattern = patterns.filter((p) => p.test(text)).length;
  const verdict = literal + pattern === 0 ? "clean" : `✗ ${literal} known token(s), ${pattern} key pattern(s)`;
  if (literal + pattern) bad++;
  console.log(`${id}  ${Math.round(text.length / 1024)} KB  ${verdict}`);
}
if (!ids.length) console.log("scan-outgoing: no checkpoints queued");
if (bad) { console.error(`scan-outgoing: ${bad} checkpoint(s) hold secrets — do not push`); process.exit(1); }
console.log(`scan-outgoing: ok (${ids.length} checkpoint(s), ${secrets.length} known tokens checked)`);
