import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const heavy = new URL("heavy.mjs", import.meta.url).pathname;
const top = mkdtempSync(join(tmpdir(), "heavy-"));
const bin = join(top, "bin");
mkdirSync(bin);
for (const tool of ["npm", "pnpm", "job"]) {
  writeFileSync(join(bin, tool), '#!/bin/sh\ntouch "$HEAVY_TEST_MARK"\nwhile kill -0 "$HEAVY_TEST_PID" 2>/dev/null; do sleep 0.2; done\n');
  chmodSync(join(bin, tool), 0o755);
}
const noPs = join(top, "no-ps");
mkdirSync(noPs);
writeFileSync(join(noPs, "ps"), "#!/bin/sh\nexit 1\n");
chmodSync(join(noPs, "ps"), 0o755);
const mark = (dir, owner) => join(dir, `ran-${owner}`);
const { HEAVY_SLOTS, ...inherited } = process.env;
const env = (dir, owner, path = bin) => ({ ...inherited, HEAVY_DIR: dir, HEAVY_OWNER: owner, HEAVY_TEST_MARK: mark(dir, owner), HEAVY_TEST_PID: String(process.pid), PATH: `${path}:${bin}:${process.env.PATH}` });
const groups = [];
const stop = (p, signal = "SIGKILL") => { try { process.kill(-p.pid, signal); } catch {} };
after(() => { for (const p of groups) stop(p); rmSync(top, { recursive: true, force: true }); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slots = () => mkdtempSync(join(top, "slots-"));
const runOn = (path, dir, owner, ...cmd) => runWith({}, path, dir, owner, ...cmd);
const runWith = (extra, path, dir, owner, ...cmd) => {
  const p = spawn(process.execPath, [heavy, ...cmd], { env: { ...env(dir, owner, path), ...extra }, detached: true, stdio: "ignore" });
  p.mark = mark(dir, owner);
  groups.push(p);
  return p;
};
const run = (...a) => runOn(bin, ...a);

const holds = (dir, p) => existsSync(p.mark);
async function within(ms, ok) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (ok()) return true;
  return ok();
}
const POLL = 2000;
const started = (dir, ...ps) => within(5000, () => ps.every((p) => holds(dir, p)));
const waits = async (dir, p) => { await sleep(POLL + 1000); return !holds(dir, p); };

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
      const racers = ["a", "b", "c", "d"].map((o) => run(dir, o, "job"));
      assert.ok(await within(POLL - 500, () => racers.some((p) => holds(dir, p))), `round ${round}: nobody started before the first poll`);
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
    const gone = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).stdout.trim();
    writeFileSync(join(dir, "slot-2"), `${gone} ghost`);
    assert.ok(await started(dir, run(dir, "a", "job")));
  });

  test("when every slot holds a dead pid, the asker takes one over and starts", async () => {
    const dir = slots();
    const gone = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).stdout.trim();
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
    writeFileSync(join(dir, "slot-0"), "");
    const asker = runWith({ HEAVY_SLOTS: "1" }, bin, dir, "a", "job");
    assert.ok(await waits(dir, asker), "the asker waits beside a file that is still being written");
    assert.ok(await within(5000, () => holds(dir, asker)), "and takes it over once it is a ghost");
  });

  test("a run that ends removes only its own slot, not one another run took after its file was removed", async () => {
    const dir = slots();
    const first = run(dir, "a", "job");
    assert.ok(await started(dir, first));
    rmSync(join(dir, "slot-0"));
    const second = run(dir, "b", "job");
    assert.ok(await started(dir, second));
    stop(first, "SIGTERM");
    await within(3000, () => first.exitCode !== null || first.signalCode !== null);
    assert.equal(readFileSync(join(dir, "slot-0"), "utf8").split(" ")[0], String(second.pid));
  });

  for (const killed of ["prepush", "one"]) {
    test(`a SIGKILLed ${killed === "one" ? "other run" : "prepush"} leaves no stuck slot or priority: the waiting run starts on the next poll`, async () => {
      const held = await prepushAndOne();
      process.kill(held[killed].pid, "SIGKILL");
      assert.ok(await within(POLL + 2000, () => holds(held.dir, held.two)));
    });
  }

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
