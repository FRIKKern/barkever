import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanup } from "./test-cleanup.mjs";

const heavy = new URL("heavy.mjs", import.meta.url).pathname;
const top = mkdtempSync(join(tmpdir(), "heavy-"));
const bin = join(top, "bin");
mkdirSync(bin);
for (const tool of ["npm", "pnpm", "job"]) {
  writeFileSync(join(bin, tool), '#!/bin/sh\ntouch "$HEAVY_TEST_MARK"\nwhile kill -0 "$HEAVY_TEST_PID" 2>/dev/null; do sleep 0.2; done\n');
  chmodSync(join(bin, tool), 0o755);
}
writeFileSync(join(bin, "brief"), '#!/bin/sh\necho >> "$HEAVY_TEST_MARK"\nwhile [ ! -e "$HEAVY_TEST_GO" ]; do sleep 0.1; done\n');
chmodSync(join(bin, "brief"), 0o755);
const fakePs = (name, body) => {
  const dir = join(top, name);
  mkdirSync(dir);
  writeFileSync(join(dir, "ps"), `#!/bin/sh\n${body}\n`);
  chmodSync(join(dir, "ps"), 0o755);
  return dir;
};
const noPs = fakePs("no-ps", "exit 1");
const gatedPs = fakePs("gated-ps", 'if grep -q "^$PPID " "$HEAVY_DIR/slot-1" 2>/dev/null; then while [ ! -e "$HEAVY_DIR/ps-go" ]; do sleep 0.05; done; fi\nexec /bin/ps "$@"');
const mark = (dir, owner) => join(dir, `ran-${owner}`);
const { HEAVY_SLOTS, ...inherited } = process.env;
const env = (dir, owner, path = bin) => ({ ...inherited, HEAVY_DIR: dir, HEAVY_OWNER: owner, HEAVY_TEST_MARK: mark(dir, owner), HEAVY_TEST_PID: String(process.pid), PATH: `${path}:${bin}:${process.env.PATH}` });
const groups = [];
const EXITED_GROUP = ["ESRCH", "EPERM"];
const stop = (p, signal = "SIGKILL") => { try { process.kill(-p.pid, signal); } catch (error) { if (!EXITED_GROUP.includes(error.code)) throw error; } };
cleanup(() => { for (const p of groups) stop(p); rmSync(top, { recursive: true, force: true }); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slots = () => mkdtempSync(join(top, "slots-"));
const runOn = (path, dir, owner, ...cmd) => runWith({}, path, dir, owner, ...cmd);
let observed = 0;
const observe = (command, args, options) => {
  const messages = join(top, `messages-${observed++}`);
  const messagesFd = openSync(messages, "w");
  const p = spawn(command, args, { ...options, detached: true, stdio: ["ignore", "ignore", messagesFd] });
  closeSync(messagesFd);
  p.messages = messages;
  groups.push(p);
  return p;
};
const runWith = (extra, path, dir, owner, ...cmd) => {
  const p = observe(process.execPath, [heavy, ...cmd], { env: { ...env(dir, owner, path), ...extra } });
  p.mark = extra.HEAVY_TEST_MARK ?? mark(dir, owner);
  return p;
};
const run = (...a) => runOn(bin, ...a);
const sleeper = () => {
  const p = spawn("sleep", ["60"], { detached: true, stdio: "ignore" });
  groups.push(p);
  return p;
};

const holds = (dir, p) => existsSync(p.mark);
const SOON = 60_000;
async function soon(ok) {
  for (const end = Date.now() + SOON; Date.now() < end; await sleep(100)) if (ok()) return true;
  await sleep(100);
  return ok();
}
const POLL = 2000;
const polled = (p) => /heavy: waiting/.test(readFileSync(p.messages, "utf8"));
const started = (dir, ...ps) => soon(() => ps.every((p) => holds(dir, p)));
const waits = async (dir, ...ps) => { if (!(await soon(() => ps.every(polled)))) return false; await sleep(POLL + 1000); return !ps.some((p) => holds(dir, p)); };
const firstTry = async (dir, ...ps) => (await started(dir, ...ps)) && !ps.some(polled);
const ended = (p) => soon(() => p.exitCode !== null || p.signalCode !== null);
const wants = (dir) => readdirSync(dir).filter((f) => f.startsWith("want-"));
const gonePid = () => spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).stdout.trim();

async function prepushAndOne() {
  const dir = slots();
  const prepush = run(dir, "lander", "npm", "run", "prepush");
  assert.ok(await started(dir, prepush), "the prepush takes a slot");
  const one = run(dir, "a", "job");
  assert.ok(await started(dir, one), "one other run is admitted beside it");
  const two = run(dir, "b", "job");
  assert.ok(await waits(dir, two), "a second other run waits while the prepush holds");
  return { dir, prepush, one, two };
}

describe("heavy.mjs slots", { concurrency: true }, () => {
  test("while a prepush holds a slot, one other run is admitted and the next waits until a slot frees", async () => {
    const { dir, one, two } = await prepushAndOne();
    stop(one, "SIGTERM");
    assert.ok(await started(dir, two), "the waiting run starts when the other run ends");
  });

  test("two runs asking at the same moment beside a prepush: exactly one starts", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "lander", "npm", "run", "prepush")));
    const pair = [run(dir, "a", "job"), run(dir, "b", "job")];
    assert.ok(await soon(() => pair.some((p) => holds(dir, p))), "one starts");
    assert.ok(await waits(dir, ...pair.filter((p) => !holds(dir, p))), "the other waits");
    assert.equal(pair.filter((p) => holds(dir, p)).length, 1);
  });

  test("four runs asking at the same moment beside a prepush: exactly one starts, on its first try", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "lander", "npm", "run", "prepush")));
    const racers = ["a", "b", "c", "d"].map((o) => run(dir, o, "job"));
    assert.ok(await soon(() => racers.some((p) => holds(dir, p))), "one starts");
    assert.ok(await waits(dir, ...racers.filter((p) => !holds(dir, p))), "the other three wait");
    const winners = racers.filter((p) => holds(dir, p));
    assert.equal(winners.length, 1);
    assert.ok(!polled(winners[0]), "the winner started on its first try");
    assert.equal(readdirSync(dir).filter((f) => f.startsWith("slot-")).length, 2, "the losers left no slot files");
  });

  test("twenty rounds of four runs asking at once beside a prepush: in every round one starts on its first try", async () => {
    const home = slots();
    const prepush = run(home, "lander", "npm", "run", "prepush");
    assert.ok(await started(home, prepush));
    for (let round = 0; round < 20; round++) {
      const dir = slots();
      writeFileSync(join(dir, "slot-0"), `${prepush.pid} lander`);
      const racers = ["a", "b", "c", "d"].map((o) => run(dir, o, "job"));
      assert.ok(await soon(() => racers.some((p) => holds(dir, p))), `round ${round}: nobody started`);
      assert.ok(!polled(racers.find((p) => holds(dir, p))), `round ${round}: the winner did not acquire on its first try`);
      racers.forEach((p) => stop(p));
    }
  });

  test("a run whose worktree already holds a slot never writes a slot file while it waits", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "tree", "job")));
    const writes = [];
    const watcher = watch(dir, (_, name) => name?.startsWith("slot-") && writes.push(name));
    const twin = runWith({ HEAVY_TEST_MARK: join(dir, "ran-twin") }, bin, dir, "tree", "job");
    const waited = await waits(dir, twin);
    watcher.close();
    assert.ok(waited, "the twin waits");
    assert.deepEqual(writes, []);
  });

  test("a waiting run starts when the prepush ends", async () => {
    const { dir, prepush, two } = await prepushAndOne();
    stop(prepush, "SIGTERM");
    assert.ok(await started(dir, two));
  });

  test("without a prepush, all three slots fill", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "a", "job"), run(dir, "b", "job"), run(dir, "c", "job")));
  });

  test("a second prepush is not an other run: two prepushes and one other run fill the slots", async () => {
    const dir = slots();
    const p1 = run(dir, "lander-1", "npm", "run", "prepush");
    const p2 = run(dir, "lander-2", "npm", "run", "prepush");
    assert.ok(await started(dir, p1, p2));
    assert.ok(await started(dir, run(dir, "a", "job")));
  });

  test("a second prepush is still admitted beside a prepush and one other run", async () => {
    const { dir } = await prepushAndOne();
    assert.ok(await started(dir, run(dir, "lander-2", "npm", "run", "prepush")));
  });

  for (const words of [["npm", "run", "prepush:x"], ["npm", "test"], ["npm", "run", "prepush", "--", "x"], ["pnpm", "prepush"], ["pnpm", "run", "prepush"]]) {
    test(`a holder running ${words.join(" ")} gets no priority: both other runs start`, async () => {
      const dir = slots();
      assert.ok(await started(dir, run(dir, "lander", ...words)));
      assert.ok(await started(dir, run(dir, "a", "job"), run(dir, "b", "job")));
    });
  }

  test("when ps fails, a prepush holder counts as an ordinary run and the asking runs keep polling", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "lander", "npm", "run", "prepush")));
    const pair = [runOn(noPs, dir, "a", "job"), runOn(noPs, dir, "b", "job")];
    assert.ok(await started(dir, ...pair));
  });

  test("a dead holder in a higher slot than the free one does not count beside a prepush", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "lander", "npm", "run", "prepush")));
    writeFileSync(join(dir, "slot-2"), `${gonePid()} ghost`);
    assert.ok(await started(dir, run(dir, "a", "job")));
  });

  test("when every slot holds a dead pid, the asker takes one over and starts", async () => {
    const dir = slots();
    const gone = gonePid();
    for (const i of [0, 1, 2]) writeFileSync(join(dir, `slot-${i}`), `${gone} ghost`);
    assert.ok(await started(dir, run(dir, "a", "job")));
  });

  for (const text of ["", "0 ghost", "-1 ghost", "abc ghost"]) {
    test(`a slot file reading ${JSON.stringify(text)} is a ghost once it is 5 s old: the asker takes it over`, async () => {
      const dir = slots();
      writeFileSync(join(dir, "slot-0"), text);
      assert.ok(await started(dir, runWith({ HEAVY_SLOTS: "1" }, bin, dir, "a", "job")));
    });
  }

  test("a fresh slot file with no pid yet is a run mid-write: it holds the slot until it is 5 s old", async () => {
    const dir = slots();
    const slot = join(dir, "slot-0");
    writeFileSync(slot, "");
    const born = statSync(slot, { bigint: true }).birthtimeNs;
    const asker = runWith({ HEAVY_SLOTS: "1" }, bin, dir, "a", "job");
    assert.ok(await started(dir, asker), "the asker eventually takes over the empty slot");
    const startedAfter = statSync(asker.mark, { bigint: true }).birthtimeNs - born;
    assert.ok(startedAfter >= 5_000_000_000n, `the asker waited ${Number(startedAfter / 1_000_000n)} ms for the fresh slot to become a ghost`);
    assert.ok(startedAfter < 30_000_000_000n, `the asker took ${Number(startedAfter / 1_000_000n)} ms to take over a slot that is a ghost at 5 s`);
  });

  test("a run that ends removes only its own slot, not one another run took after its file was removed", async () => {
    const dir = slots();
    const first = run(dir, "a", "job");
    assert.ok(await started(dir, first));
    rmSync(join(dir, "slot-0"));
    const second = run(dir, "b", "job");
    assert.ok(await started(dir, second));
    stop(first, "SIGTERM");
    assert.ok(await ended(first), "the first run exits");
    assert.equal(readFileSync(join(dir, "slot-0"), "utf8").split(" ")[0], String(second.pid));
  });

  for (const killed of ["prepush", "one"]) {
    test(`a SIGKILLed ${killed === "one" ? "other run" : "prepush"} leaves no stuck slot or priority: the waiting run starts on the next poll`, async () => {
      const held = await prepushAndOne();
      process.kill(held[killed].pid, "SIGKILL");
      assert.ok(await started(held.dir, held.two));
    });
  }

  test("beside a prepush, a waiter starts before a back-to-back looper's next run", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "lander", "npm", "run", "prepush")));
    const looped = mark(dir, "loop");
    const go = join(dir, "go");
    observe("sh", ["-c", 'while kill -0 "$HEAVY_TEST_PID" 2>/dev/null; do "$0" "$1" brief; done', process.execPath, heavy], { env: { ...env(dir, "loop"), HEAVY_TEST_GO: go } });
    const loops = () => (existsSync(looped) ? readFileSync(looped, "utf8").length : 0);
    assert.ok(await soon(() => loops() === 1), "the looper's first run starts");
    const waiter = run(dir, "w", "job");
    assert.ok(await soon(() => polled(waiter)), "the waiter is queued while the looper's first run holds");
    writeFileSync(go, "");
    assert.ok(await started(dir, waiter), "the waiter starts");
    assert.equal(loops(), 1, "the looper ran again before the waiter");
  });

  test("runs asking at once while slots are free all start on their first try", async () => {
    const dir = slots();
    assert.ok(await firstTry(dir, run(dir, "a", "job"), run(dir, "b", "job"), run(dir, "c", "job")));
  });

  test("a waiter whose worktree holds a slot does not hold up other runs", async () => {
    const dir = slots();
    const two = { HEAVY_SLOTS: "2" };
    assert.ok(await started(dir, runWith(two, bin, dir, "tree", "job")));
    const twin = runWith({ ...two, HEAVY_TEST_MARK: join(dir, "ran-twin") }, bin, dir, "tree", "job");
    assert.ok(await soon(() => polled(twin) && wants(dir).includes(`want-${twin.pid}`)), "the twin waits in the queue");
    assert.ok(await firstTry(dir, runWith(two, bin, dir, "b", "job")));
  });

  for (const [label, name] of [["a dead pid", () => `want-${gonePid()}`], ["pid 0", () => "want-0"], ["no pid", () => "want-abc"], ["a live pid that is not a heavy run", () => `want-${sleeper().pid}`]]) {
    test(`a want-file naming ${label} never holds up the queue`, async () => {
      const dir = slots();
      assert.ok(await started(dir, run(dir, "lander", "npm", "run", "prepush")));
      const stale = name();
      writeFileSync(join(dir, stale), "stale");
      assert.ok(await firstTry(dir, run(dir, "a", "job")));
      if (label === "a dead pid") assert.ok(!wants(dir).includes(stale), "the dead pid's want-file is removed");
    });
  }

  test("a stale want-file left under the asking run's own pid does not put it ahead of an older waiter", async () => {
    const { dir, one, two } = await prepushAndOne();
    const go = join(dir, "go");
    const stale = observe("sh", ["-c", 'echo stale > "$0/want-$$"; touch "$0/staled"; while [ ! -e "$1" ]; do sleep 0.05; done; exec "$2" "$3" job', dir, go, process.execPath, heavy], { env: env(dir, "x") });
    assert.ok(await soon(() => existsSync(join(dir, "staled"))));
    rmSync(join(dir, `want-${two.pid}`));
    const older = runWith({ HEAVY_TEST_MARK: join(dir, "ran-older") }, bin, dir, "w", "job");
    assert.ok(await soon(() => polled(older) && wants(dir).includes(`want-${older.pid}`)), "the older waiter is queued");
    stop(two);
    writeFileSync(go, "");
    assert.ok(await soon(() => polled(stale)), "the run with the stale want-file asks and is refused");
    stop(one, "SIGTERM");
    assert.ok(await started(dir, older), "the older waiter starts");
    assert.ok(!existsSync(mark(dir, "x")), "the run with the stale want-file waits");
  });

  for (const signal of ["SIGTERM", "SIGINT"]) {
    test(`a run leaves no want-file once it starts, and a waiter stopped by ${signal} removes its own`, async () => {
      const { dir, two } = await prepushAndOne();
      assert.deepEqual(wants(dir), [`want-${two.pid}`]);
      stop(two, signal);
      assert.ok(await soon(() => wants(dir).length === 0));
      assert.ok(await ended(two), "the waiter exits");
      assert.equal(two.exitCode, signal === "SIGINT" ? 130 : 143);
    });
  }

  test("a run whose slot file is replaced while it checks the other holders counts as a lost race: it waits and leaves the new file", async () => {
    const dir = slots();
    const two = { HEAVY_SLOTS: "2" };
    assert.ok(await started(dir, runWith(two, bin, dir, "other", "job")));
    writeFileSync(join(dir, "slot-1"), `${gonePid()} ghost`);
    const asker = runWith(two, gatedPs, dir, "x", "job");
    const theirs = `${process.pid} thief`;
    assert.ok(await soon(() => existsSync(join(dir, "slot-1")) && readFileSync(join(dir, "slot-1"), "utf8").startsWith(`${asker.pid} `)), "the asker took the ghost's slot");
    writeFileSync(join(dir, "slot-1"), theirs);
    writeFileSync(join(dir, "ps-go"), "");
    assert.ok(await waits(dir, asker), "the asker does not run");
    assert.equal(readFileSync(join(dir, "slot-1"), "utf8"), theirs);
  });

  test("a HEAVY_DIR that goes just after a run writes its want file prints only the is gone line", async () => {
    const dir = join(top, "gone-at-want");
    const preload = join(top, "gone-at-want.mjs");
    writeFileSync(preload, `import fs from "node:fs";\nimport {syncBuiltinESMExports} from "node:module";\nconst real = fs.writeFileSync;\nfs.writeFileSync = (p, ...a) => { real(p, ...a); if (String(p).includes("/want-")) fs.rmSync(${JSON.stringify(dir)}, {recursive: true}); };\nsyncBuiltinESMExports();\n`);
    let stderr = "";
    const asker = spawn(process.execPath, ["--import", preload, heavy, "job"], { env: env(dir, "c"), detached: true, stdio: ["ignore", "ignore", "pipe"] });
    groups.push(asker);
    asker.stderr.on("data", (d) => (stderr += d));
    assert.ok(await ended(asker), "the run exits");
    assert.equal(asker.exitCode, 1);
    assert.match(stderr, new RegExp(`heavy: ${dir} is gone`));
    assert.doesNotMatch(stderr, /Error|\n\s+at /, "no stack trace");
  });

  for (const gone of ["removed", "replaced by a file"]) test(`a waiting run whose HEAVY_DIR is ${gone} exits 1 naming the dir instead of polling forever`, async () => {
    const { dir, two } = await prepushAndOne();
    let stderr = "";
    const asker = spawn(process.execPath, [heavy, "job"], { env: env(dir, "c"), detached: true, stdio: ["ignore", "ignore", "pipe"] });
    groups.push(asker);
    asker.stderr.on("data", (d) => (stderr += d));
    assert.ok(await soon(() => wants(dir).length === 2), "both waiters are queued");
    rmSync(dir, { recursive: true, force: true });
    if (gone !== "removed") writeFileSync(dir, "");
    assert.ok((await ended(asker)) && (await ended(two)), "both waiters exit");
    assert.equal(asker.exitCode, 1);
    assert.equal(two.exitCode, 1);
    assert.match(stderr, new RegExp(`heavy: ${dir} is gone`));
    assert.doesNotMatch(stderr, /Error|\n\s+at /, "no stack trace");
  });

  test("a run whose HEAVY_DIR is removed while its command runs still exits with the command's code", async () => {
    const dir = slots();
    const holder = sleeper();
    const p = runWith({ HEAVY_TEST_PID: String(holder.pid) }, bin, dir, "a", "job");
    assert.ok(await started(dir, p));
    rmSync(dir, { recursive: true, force: true });
    stop(holder);
    assert.ok(await ended(p), "the run exits");
    assert.equal(p.exitCode, 0);
  });

  const plainRun = (dir) => spawnSync(process.execPath, [heavy, "true"], { env: env(dir, "a"), encoding: "utf8", timeout: SOON });

  test("an error heavy does not expect is not swallowed: a runs.jsonl it cannot append to fails the run, naming the error", () => {
    const dir = slots();
    mkdirSync(join(dir, "runs.jsonl"));
    const r = plainRun(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /EISDIR/);
  });

  test("an error heavy does not expect is not swallowed: a dead want-file it cannot remove fails the run, naming the error", () => {
    const dir = slots();
    mkdirSync(join(dir, "want-99999999"));
    const r = plainRun(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /EPERM|EISDIR/);
  });

  const once = (slotsEnv, ...cmd) => {
    const e = env(slots(), "a");
    if (slotsEnv === undefined) delete e.HEAVY_SLOTS;
    else e.HEAVY_SLOTS = slotsEnv;
    return spawnSync(process.execPath, [heavy, ...cmd], { env: e, encoding: "utf8", timeout: SOON });
  };

  test("HEAVY_SLOTS must be a whole number from 1 to 99; anything else is refused before taking a slot", () => {
    for (const bad of ["", "0", "-1", "1.5", "abc", "100", " 3", "3 ", "03", "1e2", "0x3"]) {
      const r = once(bad, "true");
      assert.equal(r.status, 2, `HEAVY_SLOTS=${JSON.stringify(bad)}`);
      assert.match(r.stderr, /HEAVY_SLOTS needs a whole number from 1 to 99/);
    }
    for (const good of [undefined, "1", "3", "99"]) assert.equal(once(good, "true").status, 0, `HEAVY_SLOTS=${good}`);
  });

  test("no command prints the usage and exits 2", () => {
    const r = once(undefined);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /usage: node scripts\/heavy.mjs <command>/);
  });
});
