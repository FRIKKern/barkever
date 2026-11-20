import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

export const reportDir = (env = process.env) => (env.RUNNER_TEMP ? join(env.RUNNER_TEMP, "barkever-test-reports") : null);
export const REPORTER = fileURLToPath(import.meta.url);

const wholeFile = (data) => Boolean(data.file) && data.nesting === 0 && data.line === 1 && data.column === 1 && data.name === basename(data.file);
const result = (type, data) => (type === "test:fail" ? "fail" : data.todo !== undefined && data.todo !== false ? "todo" : data.skip !== undefined && data.skip !== false ? "skip" : "pass");

export default async function* report(source) {
  for await (const { type, data } of source) {
    if ((type !== "test:pass" && type !== "test:fail") || data.details?.type === "suite") continue;
    yield `${JSON.stringify({ kind: wholeFile(data) ? "file" : "test", file: data.file ? relative(root, data.file) : null, name: data.name, result: result(type, data) })}\n`;
  }
}
