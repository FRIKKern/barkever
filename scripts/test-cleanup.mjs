import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { after } from "node:test";

export function cleanup(roots, also = () => {}) {
  const clear = () => {
    also();
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  };
  after(clear);
  for (const signal of ["SIGINT", "SIGHUP", "SIGQUIT"]) {
    process.on(signal, () => {
      clear();
      process.exit(1);
    });
  }
  const sweeper = spawn("/bin/sh", ["-c", 'cat >/dev/null; rm -rf -- "$@"', "sh", ...roots], { stdio: ["pipe", "ignore", "ignore"], detached: true });
  sweeper.unref();
  sweeper.stdin.unref();
}
