import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";

export const secretPatterns = [/sk-ant-[A-Za-z0-9_-]{20,}/, /sk-proj-[A-Za-z0-9_-]{20,}/, /\bgh[opsur]_[A-Za-z0-9]{30,}/, /\bgithub_pat_[A-Za-z0-9_]{20,}/, /\bbpsess_[A-Za-z0-9_-]{16,}/, /\bxox[abeprs]-[A-Za-z0-9-]{10,}/, /\bnpm_[A-Za-z0-9]{30,}/, /\bAKIA[0-9A-Z]{16}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

const PUBLIC_DEFAULTS = new Set(["barkpark-dev-token"]);

export function knownSecrets() {
  const found = [];
  const cfgPath = `${homedir()}/.config/barkpark/config.json`;
  if (existsSync(cfgPath)) {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    for (const t of [cfg.token, cfg.cloud_token, ...(cfg.known_servers ?? []).map((s) => s.token)]) {
      if (t && t.length > 12 && !PUBLIC_DEFAULTS.has(t)) found.push(t);
    }
  }
  const envPath = new URL("../app/.env.local", import.meta.url);
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?[A-Z0-9_]*(PASSWORD|SECRET|TOKEN|KEY|EMAIL)[A-Z0-9_]*\s*=\s*["']?(.*?)["']?\s*$/);
      if (m && m[2].length >= 8) found.push(m[2]);
    }
  }
  return found;
}
