import { after } from "node:test";

export function cleanup(clear) {
  after(clear);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
    process.on(signal, () => {
      clear();
      process.exit(1);
    });
  }
}
