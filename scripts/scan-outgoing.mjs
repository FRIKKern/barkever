#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { knownSecrets, secretPatterns } from "./secrets.mjs";

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] });
const hasOrigin = () => { try { git(["rev-parse", "--verify", "-q", "origin/main"]); return true; } catch { return false; } };

const secrets = knownSecrets();
const patterns = secretPatterns;

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
