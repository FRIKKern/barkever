import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./pack.mjs";
import { PACK_DIR } from "./pack-door.mjs";
import { REPORT, act, bark, commit, git, plan, read, stagingAt, tmp, world, write } from "./sync-act-world.mjs";

test("act refuses a sync commit that leaves the pack, is not Barkpark's, forges SOURCE.md or the report, or sits on another staging", async () => {
  const cases = [];
  const refused = (name, change, needle, content = { action: "push" }, more = {}) => cases.push(async () => {
    const w = world();
    change(w);
    const r = await act(w, plan(w, content), [], more);
    assert.equal(r.status, 1, `${name}: ${r.err}`);
    assert.match(r.err, needle, name);
    assert.ok([w.staging, w.moved].includes(stagingAt(w)), `${name}: nothing pushed`);
    assert.deepEqual([r.token, r.seen, r.gh], [[], [], ""], `${name}: the token reached no child, no ci dispatched`);
  });
  const synced = (w) => (bark(w, "{\"v\": 2}\n", { extra: { "goldens/blocks/chart.golden.json": "{}\n", "goldens/blocks/toc.golden.json": "{}\n" } }), w);
  const edit = (w, path, from, to) => {
    const text = read(w.work, path);
    assert.ok(text.includes(from), `${path} holds ${from}`);
    write(w.work, path, text.replace(from, to));
  };
  refused("an app file in the commit", (w) => (synced(w), write(w.work, "app/x.ts", "y\n"), commit(w, "sync")), /M 100644 100644 app\/x\.ts/);
  refused("an executable in the pack", (w) => (synced(w), chmodSync(join(w.work, `${PACK_DIR}/conformance.mjs`), 0o755), commit(w, "sync")), /100755 \S+\/conformance\.mjs/);
  refused("a pack file not as Barkpark holds it", (w) => (synced(w), write(w.work, `${PACK_DIR}/goldens/blocks/paragraph.golden.json`, "{\"v\": 666}\n"), commit(w, "sync")), /the pack differs from Barkpark [0-9a-f]{40}: goldens\/blocks\/paragraph\.golden\.json/);
  refused("a Barkpark file the pack never holds", (w) => (synced(w), write(w.work, `${PACK_DIR}/goldens/limits/deep.golden.json`, "{}\n"), commit(w, "sync")), /goldens\/limits\/deep\.golden\.json is never in the pack/);
  refused("a golden the stamp names left out", (w) => (synced(w), rmSync(join(w.work, `${PACK_DIR}/goldens/blocks/toc.golden.json`)), commit(w, "sync")), /block goldens are not the ones its stamp names/);
  refused("a forged SOURCE.md row", (w) => (synced(w), edit(w, `${PACK_DIR}/SOURCE.md`, `\`${sha256("export {}\n")}\``, `\`${"a".repeat(64)}\``), commit(w, "sync")), /SOURCE\.md is not as pack-sync writes it for these files/);
  refused("a Barkpark commit off its main", (w) => (bark(w, "{\"v\": 2}\n", { branch: "side" }), commit(w, "sync")), /is not on Barkpark's main/);
  refused("a moved row in the report", (w) => (synced(w), edit(w, REPORT, '"pass"', '"fail"'), commit(w, "sync")), /is not the staging report on the new stamp/);
  refused("a wrong pack_stamp", (w) => (synced(w), edit(w, REPORT, /"pack_stamp": "[0-9a-f]{64}"/.exec(read(w.work, REPORT))[0], `"pack_stamp": "${"b".repeat(64)}"`), commit(w, "sync")), /is not the staging report on the new stamp/);
  refused("a report without its last newline", (w) => (synced(w), write(w.work, REPORT, read(w.work, REPORT).trimEnd()), commit(w, "sync")), /is not as conformance writes it/);
  refused("staging moved since the plan", (w) => {
    synced(w);
    commit(w, "sync");
    const other = join(tmp("other"), "repo");
    git(w.base, "clone", "-q", "-b", "staging", w.origin, other);
    write(other, "app/x.ts", "landed meanwhile\n");
    git(other, "commit", "-qam", "a land");
    git(other, "push", "-q", "origin", "HEAD:staging");
    w.moved = git(other, "rev-parse", "HEAD");
  }, /staging moved since the plan, nothing pushed/);
  refused("a plan asking for another action", (w) => (synced(w), commit(w, "sync")), /the plan asks for land: act only pushes or reports/, { action: "land" });
  refused("no pack path from the door", (w) => (synced(w), commit(w, "sync")), /act takes the pack path in PACK_DIR, from scripts\/pack-door\.mjs/, { action: "push" }, { PACK_DIR: "" });
  refused("no valid bundle", (w) => w, /no valid sync\.bundle/, { action: "push", bundle: false });
  await Promise.all(cases.map((c) => c()));
});
