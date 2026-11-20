import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
export const reportDir = (env = process.env) => (env.RUNNER_TEMP ? join(env.RUNNER_TEMP, "barkever-test-reports") : null);
export const REPORTER = fileURLToPath(import.meta.url);

const set = (value) => value !== undefined && value !== false;
const wholeFile = (data) => data.nesting === 0 && data.line === 1 && data.column === 1 && data.details?.type !== "suite";
const result = (type, data) => (type === "test:fail" ? "fail" : set(data.todo) ? "todo" : set(data.skip) ? "skip" : "pass");

export default async function* report(source) {
  for await (const { type, data } of source) {
    if (type !== "test:pass" && type !== "test:fail") continue;
    const outcome = result(type, data);
    if (data.details?.type === "suite" && outcome === "pass") continue;
    yield `${JSON.stringify({ kind: wholeFile(data) ? "file" : "test", file: data.file ? relative(root, data.file) : null, name: data.name, result: outcome })}\n`;
  }
}
