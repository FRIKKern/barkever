import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, watch, writeFileSync } from "node:fs";
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
writeFileSync(join(bin, "brief"), '#!/bin/sh\necho >> "$HEAVY_TEST_MARK"\nsleep 1.5\n');
chmodSync(join(bin, "brief"), 0o755);
const fakePs = (name, body) => {
  const dir = join(top, name);
  mkdirSync(dir);
  writeFileSync(join(dir, "ps"), `#!/bin/sh\n${body}\n`);
  chmodSync(join(dir, "ps"), 0o755);
  return dir;
};
const noPs = fakePs("no-ps", "exit 1");
const slowPs = fakePs("slow-ps", 'sleep 1\nexec /bin/ps "$@"');
const mark = (dir, owner) => join(dir, `ran-${owner}`);
const { HEAVY_SLOTS, ...inherited } = process.env;
const env = (dir, owner, path = bin) => ({ ...inherited, HEAVY_DIR: dir, HEAVY_OWNER: owner, HEAVY_TEST_MARK: mark(dir, owner), HEAVY_TEST_PID: String(process.pid), PATH: `${path}:${bin}:${process.env.PATH}` });
const groups = [];
const stop = (p, signal = "SIGKILL") => { try { process.kill(-p.pid, signal); } catch {} };
cleanup(() => { for (const p of groups) stop(p); rmSync(top, { recursive: true, force: true }); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slots = () => mkdtempSync(join(top, "slots-"));
const runOn = (path, dir, owner, ...cmd) => runWith({}, path, dir, owner, ...cmd);
const runWith = (extra, path, dir, owner, ...cmd) => {
  const p = spawn(process.execPath, [heavy, ...cmd], { env: { ...env(dir, owner, path), ...extra }, detached: true, stdio: "ignore" });
  p.mark = mark(dir, owner);
  groups.push(p);
  return p;
};
const runObserved = (dir, owner, ...cmd) => {
  const messages = join(dir, `messages-${owner}`);
  const messagesFd = openSync(messages, "w");
  const p = spawn(process.execPath, [heavy, ...cmd], { env: env(dir, owner), detached: true, stdio: ["ignore", "ignore", messagesFd] });
  closeSync(messagesFd);
  p.mark = mark(dir, owner);
  p.messages = messages;
  groups.push(p);
  return p;
};
const run = (...a) => runOn(bin, ...a);
const sleeper = () => {
  const p = spawn("sleep", ["60"], { detached: true, stdio: "ignore" });
  groups.push(p);
  return p;
};

const holds = (dir, p) => existsSync(p.mark);
async function within(ms, ok) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (ok()) return true;
  return ok();
}
const POLL = 2000;
const started = (dir, ...ps) => within(5000, () => ps.every((p) => holds(dir, p)));
const waits = async (dir, p) => { await sleep(POLL + 1000); return !holds(dir, p); };
const firstTry = (dir, ...ps) => within(POLL - 500, () => ps.every((p) => holds(dir, p)));
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
    assert.ok(await within(POLL + 2000, () => holds(dir, two)), "the waiting run starts when the other run ends");
  });

  test("two runs asking at the same moment beside a prepush: exactly one starts", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "lander", "npm", "run", "prepush")));
    const pair = [run(dir, "a", "job"), run(dir, "b", "job")];
    await sleep(2 * POLL + 1000);
    assert.equal(pair.filter((p) => holds(dir, p)).length, 1);
  });

  test("four runs asking at the same moment beside a prepush: exactly one starts, on its first try", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "lander", "npm", "run", "prepush")));
    const racers = ["a", "b", "c", "d"].map((o) => run(dir, o, "job"));
    assert.ok(await within(POLL - 500, () => racers.some((p) => holds(dir, p))), "one starts before the first poll");
    await sleep(POLL + 1000);
    assert.equal(racers.filter((p) => holds(dir, p)).length, 1);
    assert.equal(readdirSync(dir).filter((f) => f.startsWith("slot-")).length, 2, "the losers left no slot files");
  });

  test("twenty rounds of four runs asking at once beside a prepush: in every round one starts on its first try", async () => {
    const home = slots();
    const prepush = run(home, "lander", "npm", "run", "prepush");
    assert.ok(await started(home, prepush));
    for (let round = 0; round < 20; round++) {
      const dir = slots();
      writeFileSync(join(dir, "slot-0"), `${prepush.pid} lander`);
      const racers = ["a", "b", "c", "d"].map((o) => runObserved(dir, o, "job"));
      assert.ok(await within(10_000, () => racers.some((p) => holds(dir, p))), `round ${round}: nobody started`);
      const winner = racers.find((p) => holds(dir, p));
      assert.doesNotMatch(readFileSync(winner.messages, "utf8"), /heavy: waiting/, `round ${round}: the winner did not acquire on its first try`);
      racers.forEach((p) => stop(p));
    }
  });

  test("a run whose worktree already holds a slot never writes a slot file while it waits", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "tree", "job")));
    const writes = [];
    const watcher = watch(dir, (_, name) => name?.startsWith("slot-") && writes.push(name));
    const twin = runWith({ HEAVY_TEST_MARK: join(dir, "ran-twin") }, bin, dir, "tree", "job");
    await sleep(POLL + 1000);
    watcher.close();
    assert.ok(!existsSync(join(dir, "ran-twin")), "the twin waits");
    assert.deepEqual(writes, []);
  });

  test("a waiting run starts when the prepush ends", async () => {
    const { dir, prepush, two } = await prepushAndOne();
    stop(prepush, "SIGTERM");
    assert.ok(await within(POLL + 2000, () => holds(dir, two)));
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
      const old = new Date(Date.now() - 60_000);
      writeFileSync(join(dir, "slot-0"), text);
      utimesSync(join(dir, "slot-0"), old, old);
      assert.ok(await started(dir, runWith({ HEAVY_SLOTS: "1" }, bin, dir, "a", "job")));
    });
  }

  test("a fresh slot file with no pid yet is a run mid-write: it holds the slot until it is 5 s old", async () => {
    const dir = slots();
    const slot = join(dir, "slot-0");
    writeFileSync(slot, "");
    const born = statSync(slot, { bigint: true }).birthtimeNs;
    const asker = runWith({ HEAVY_SLOTS: "1" }, bin, dir, "a", "job");
    assert.ok(await within(10_000, () => holds(dir, asker)), "the asker eventually takes over the empty slot");
    const startedAfter = statSync(asker.mark, { bigint: true }).birthtimeNs - born;
    assert.ok(startedAfter >= 5_000_000_000n, `the asker waited ${Number(startedAfter / 1_000_000n)} ms for the fresh slot to become a ghost`);
  });

  test("a run that ends removes only its own slot, not one another run took after its file was removed", async () => {
    const dir = slots();
    const first = run(dir, "a", "job");
    assert.ok(await started(dir, first));
    rmSync(join(dir, "slot-0"));
    const second = run(dir, "b", "job");
    assert.ok(await started(dir, second));
    stop(first, "SIGTERM");
    assert.ok(await within(3000, () => first.exitCode !== null || first.signalCode !== null), "the first run exits");
    assert.equal(readFileSync(join(dir, "slot-0"), "utf8").split(" ")[0], String(second.pid));
  });

  for (const killed of ["prepush", "one"]) {
    test(`a SIGKILLed ${killed === "one" ? "other run" : "prepush"} leaves no stuck slot or priority: the waiting run starts on the next poll`, async () => {
      const held = await prepushAndOne();
      process.kill(held[killed].pid, "SIGKILL");
      assert.ok(await within(POLL + 2000, () => holds(held.dir, held.two)));
    });
  }

  test("beside a prepush, a waiter starts before a back-to-back looper's next run", async () => {
    const dir = slots();
    assert.ok(await started(dir, run(dir, "lander", "npm", "run", "prepush")));
    const looped = mark(dir, "loop");
    const looper = spawn("sh", ["-c", 'while kill -0 "$HEAVY_TEST_PID" 2>/dev/null; do "$0" "$1" brief; done', process.execPath, heavy], { env: env(dir, "loop"), detached: true, stdio: "ignore" });
    groups.push(looper);
    const loops = () => (existsSync(looped) ? readFileSync(looped, "utf8").length : 0);
    assert.ok(await within(5000, () => loops() === 1), "the looper's first run starts");
    const waiter = run(dir, "w", "job");
    assert.ok(await within(POLL + 2500, () => holds(dir, waiter)), "the waiter starts");
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
    assert.ok(await within(3000, () => wants(dir).includes(`want-${twin.pid}`)), "the twin waits in the queue");
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

  for (const signal of ["SIGTERM", "SIGINT"]) {
    test(`a run leaves no want-file once it starts, and a waiter stopped by ${signal} removes its own`, async () => {
      const { dir, two } = await prepushAndOne();
      assert.deepEqual(wants(dir), [`want-${two.pid}`]);
      stop(two, signal);
      assert.ok(await within(3000, () => wants(dir).length === 0));
    });
  }

  test("a run whose slot file is replaced while it checks the other holders counts as a lost race: it waits and leaves the new file", async () => {
    const dir = slots();
    const two = { HEAVY_SLOTS: "2" };
    assert.ok(await started(dir, runWith(two, bin, dir, "other", "job")));
    writeFileSync(join(dir, "slot-1"), `${gonePid()} ghost`);
    const asker = runWith(two, slowPs, dir, "x", "job");
    const theirs = `${process.pid} thief`;
    const replaced = await within(5000, () => {
      if (!existsSync(join(dir, "slot-1")) || !readFileSync(join(dir, "slot-1"), "utf8").startsWith(`${asker.pid} `)) return false;
      writeFileSync(join(dir, "slot-1"), theirs);
      return true;
    });
    assert.ok(replaced, "the asker took the ghost's slot");
    assert.ok(await waits(dir, asker), "the asker does not run");
    assert.equal(readFileSync(join(dir, "slot-1"), "utf8"), theirs);
  });

  for (const gone of ["removed", "replaced by a file"]) test(`a waiting run whose HEAVY_DIR is ${gone} exits 1 naming the dir instead of polling forever`, async () => {
    const { dir, two } = await prepushAndOne();
    let stderr = "";
    const asker = spawn(process.execPath, [heavy, "job"], { env: env(dir, "c"), detached: true, stdio: ["ignore", "ignore", "pipe"] });
    groups.push(asker);
    asker.stderr.on("data", (d) => (stderr += d));
    assert.ok(await within(3000, () => wants(dir).length === 2), "both waiters are queued");
    rmSync(dir, { recursive: true, force: true });
    if (gone !== "removed") writeFileSync(dir, "");
    assert.ok(await within(POLL + 2000, () => asker.exitCode !== null && two.exitCode !== null), "both waiters exit");
    assert.equal(asker.exitCode, 1);
    assert.equal(two.exitCode, 1);
    assert.match(stderr, new RegExp(`heavy: ${dir} is gone`));
  });

  test("a run whose HEAVY_DIR is removed while its command runs still exits with the command's code", async () => {
    const dir = slots();
    const holder = sleeper();
    const p = runWith({ HEAVY_TEST_PID: String(holder.pid) }, bin, dir, "a", "job");
    assert.ok(await started(dir, p));
    rmSync(dir, { recursive: true, force: true });
    stop(holder);
    assert.ok(await within(3000, () => p.exitCode !== null), "the run exits");
    assert.equal(p.exitCode, 0);
  });

  const once = (slotsEnv, ...cmd) => {
    const e = env(slots(), "a");
    if (slotsEnv === undefined) delete e.HEAVY_SLOTS;
    else e.HEAVY_SLOTS = slotsEnv;
    return spawnSync(process.execPath, [heavy, ...cmd], { env: e, encoding: "utf8", timeout: 5000 });
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
