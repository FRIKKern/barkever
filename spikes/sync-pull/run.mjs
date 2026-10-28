// Offline catch-up by pull: N = 10, 100, 1000 mixed changes.
// usage: node run.mjs [seedSize=2000] [Ns=10,100,1000]
import { writeFileSync, mkdirSync } from 'node:fs';
import * as bp from './bp.mjs';
import { Replica, compare } from './replica.mjs';
import { Model, makeChanges, seed } from './changes.mjs';

const SEED = Number(process.argv[2] || 2000);
const NS = (process.argv[3] || '0,10,100,1000').split(',').map(Number);
const out = { at: new Date().toISOString(), seed: SEED, rounds: [] };

function clone(r, opts) {
  const c = new Replica(opts);
  c.docs = new Map(r.docs);
  c.cursor = { ts: r.cursor.ts, idsAtTs: new Set(r.cursor.idsAtTs) };
  return c;
}

let truth = await bp.exportAll();
let model = Model.fromRows(truth);
if (model.docs.size < SEED) {
  console.log(`seeding ${SEED - model.docs.size} docs`);
  const m2 = await seed(SEED - model.docs.size, `s${Date.now().toString(36)}`);
  truth = await bp.exportAll();
  model = Model.fromRows(truth);
}

// Initial full sync (cursor null = from the beginning).
const good = new Replica({ deletes: 'iddiff' });
const init = await good.catchUp();
const c0 = await compare(good);
console.log('initial sync', init, { ok: c0.ok, rows: c0.serverRows });
out.initial = { ...init, ok: c0.ok, rows: c0.serverRows };

for (const n of NS) {
  // two devices go offline at the same cursor
  const pullOnly = clone(good, { deletes: 'none' });
  const withDiff = clone(good, { deletes: 'iddiff' });
  const gated = clone(good, { deletes: 'countgate' });
  const cursorAtOffline = good.cursor.ts;

  bp.resetStats();
  const t0 = performance.now();
  const kinds = await makeChanges(model, n, { tag: `n${n}x${Date.now().toString(36)}` });
  const writeMs = Math.round(performance.now() - t0);
  const writeReqs = bp.stats.requests;

  const a = await pullOnly.catchUp();
  const ca = await compare(pullOnly);
  const b = await withDiff.catchUp();
  const cb = await compare(withDiff);
  const g = await gated.catchUp();
  const cg = await compare(gated);

  const round = {
    n,
    kinds,
    cursorAtOffline,
    write: { ms: writeMs, requests: writeReqs },
    pullOnly: { ...a, ok: ca.ok, ghosts: ca.ghosts.length, missing: ca.missing.length, wrongRev: ca.wrongRev.length, sampleGhosts: ca.ghosts.slice(0, 5) },
    pullPlusIdDiff: { ...b, ok: cb.ok, ghosts: cb.ghosts.length, missing: cb.missing.length, wrongRev: cb.wrongRev.length },
    pullPlusCountGate: { ...g, ok: cg.ok, ghosts: cg.ghosts.length, missing: cg.missing.length, wrongRev: cg.wrongRev.length },
    serverRows: cb.serverRows,
  };
  console.log(JSON.stringify(round, null, 1));
  out.rounds.push(round);
  // carry the correct replica forward
  good.docs = withDiff.docs;
  good.cursor = withDiff.cursor;
}

mkdirSync('results', { recursive: true });
writeFileSync(`results/run-${out.at.replace(/[:.]/g, '-')}.json`, JSON.stringify(out, null, 1));
console.log('stats', bp.stats);
