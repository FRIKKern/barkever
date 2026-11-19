import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const COMMANDS = ["awk", "basename", "bash", "cat", "chmod", "cut", "dirname", "env", "grep", "head", "jq", "ls", "mkdir", "rm", "sed", "sh", "sleep", "sha256sum", "shasum", "sort", "ssh", "tr", "wc"];

const real = (name) => execFileSync("sh", ["-c", `command -v ${name} || true`], { encoding: "utf8" }).trim();

export const BASH = real("bash");
export const GIT = real("git");

export function keyShims(dir, key) {
  mkdirSync(dir, { recursive: true });
  const log = join(dir, "..", `${dir.split("/").pop()}-seen.log`);
  const check = (name) => `case "$(export -p)" in *'${key}'*) echo "${name}" >> "${log}" ;; esac`;
  for (const name of COMMANDS.filter(real)) {
    writeFileSync(join(dir, name), `#!/bin/sh\n${check(name)}\nexec "${real(name)}" "$@"\n`);
    chmodSync(join(dir, name), 0o755);
  }
  const seen = () => {
    const out = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean) : [];
    rmSync(log, { force: true });
    return out;
  };
  return { dir, check, seen };
}
