// Edge cases for pull catch-up.
// usage: node edge.mjs [ties|skew|paging|race|all]
import { writeFileSync, mkdirSync } from 'node:fs';
import * as bp from './bp.mjs';
import { Replica, compare, isoToUs } from './replica.mjs';

const which = process.argv[2] || 'all';
const out = { at: new Date().toISOString() };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = bp.TYPE;

async function syncedReplica(opts) {
  const r = new Replica(opts);
  await r.pullChanges();
  return r;
}

// 1. Ties: how close do timestamps get? Patch 100 docs in one batch, then look.
async function ties() {
  const all = await bp.exportAll();
  const drafts = all.filter((d) => d._id.startsWith('drafts.')).slice(0, 100);
  const res = await bp.mutate(drafts.map((d) => ({ patch: { id: d._id, type: T, set: { body: 'tie ' + Math.random() } } })));
  const ts = res.results.map((r) => r.document._updatedAt).sort();
  const us = ts.map(isoToUs);
  const gaps = us.slice(1).map((u, i) => Number(u - us[i]));
  const sameMs = new Set();
  let sameMsPairs = 0;
  let sameUsPairs = 0;
  for (let i = 1; i < ts.length; i++) {
    if (ts[i].slice(0, 23) === ts[i - 1].slice(0, 23)) sameMsPairs++;
    if (ts[i] === ts[i - 1]) sameUsPairs++;
  }
  // A ms-truncated cursor (what `new Date(_updatedAt)` gives you) + `gt`:
  // re-reads rows in that ms (dupes) - never loses. A ms cursor ROUNDED UP loses.
  const mid = ts[50];
  const msTrunc = new Date(mid).toISOString(); // .sssZ
  const exact = await bp.query({ perspective: 'raw', 'filter[_updatedAt][gt]': mid, order: '_updatedAt:asc', limit: 1000 });
  const trunc = await bp.query({ perspective: 'raw', 'filter[_updatedAt][gt]': msTrunc, order: '_updatedAt:asc', limit: 1000 });
  // Parallel single writes from 20 "devices": can two land in the same ms/µs?
  const par = await Promise.all(
    drafts.slice(0, 20).map((d) => bp.mutate([{ patch: { id: d._id, type: T, set: { body: 'par ' + Math.random() } } }])),
  );
  const pts = par.map((r) => r.results[0].document._updatedAt).sort();
  let parSameMs = 0;
  let parSameUs = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].slice(0, 23) === pts[i - 1].slice(0, 23)) parSameMs++;
    if (pts[i] === pts[i - 1]) parSameUs++;
  }
  // keyset with gte + rev-dedupe over a page boundary that splits a same-ms pair
  const r = {
    parallelWrites: pts.length,
    parallelSameMsPairs: parSameMs,
    parallelSameUsPairs: parSameUs,
    parallelMinGapUs: Math.min(...pts.map(isoToUs).slice(1).map((u, i) => Number(u - isoToUs(pts[i])))),
    batch: ts.length,
    minGapUs: Math.min(...gaps),
    medianGapUs: gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)],
    sameMsPairs,
    sameUsPairs,
    cursor: mid,
    rowsAfterExactCursor: exact.result.documents.length,
    rowsAfterMsTruncatedCursor: trunc.result.documents.length,
  };
  console.log('ties', r);
  return r;
}

// 2. Clock skew: cursor from the SERVER's _updatedAt vs from the client's clock.
async function skew() {
  const rep = await syncedReplica({ deletes: 'none' });
  const serverCursor = rep.cursor.ts;
  const clientNowAhead = new Date(Date.now() + 3600_000).toISOString(); // client clock +1h
  const clientNowBehind = new Date(Date.now() - 3600_000).toISOString(); // client clock -1h
  const drafts = [...rep.docs.keys()].filter((id) => id.startsWith('drafts.')).slice(0, 5);
  await bp.mutate(drafts.map((id) => ({ patch: { id, type: T, set: { body: 'skew ' + Math.random() } } })));
  const count = async (c) =>
    (await bp.query({ perspective: 'raw', 'filter[_updatedAt][gt]': c, limit: 1000, fields: 'seq' })).result.documents.length;
  const r = {
    changes: drafts.length,
    serverCursorRows: await count(serverCursor),
    clientClockPlus1hRows: await count(clientNowAhead),
    clientClockMinus1hRows: await count(clientNowBehind),
  };
  console.log('skew', r);
  return r;
}

// 3. Pagination with a tiny page while a writer keeps editing.
// "Lost for good" = a row whose server copy the replica lacks AND whose
// _updatedAt is at or before the cursor the walk ended on, so no later pull
// from that cursor will ever fetch it.
async function paging() {
  const res = {};
  for (const mode of ['keyset', 'offset']) {
    const rep = await syncedReplica({ deletes: 'none', pageSize: 25 });
    const cursor0 = rep.cursor.ts;
    const drafts = [...rep.docs.keys()].filter((id) => id.startsWith('drafts.'));
    const batch1 = drafts.slice(0, 300);
    for (let i = 0; i < batch1.length; i += 100)
      await bp.mutate(batch1.slice(i, i + 100).map((id) => ({ patch: { id, type: T, set: { body: 'p1 ' + Math.random() } } })));

    let stop = false;
    let concurrentWrites = 0;
    const writer = (async () => {
      let k = 0;
      while (!stop) {
        const ids = batch1.slice((k * 7) % 290, ((k * 7) % 290) + 5);
        await bp.mutate([
          ...ids.map((id) => ({ patch: { id, type: T, set: { body: 'p2 ' + Math.random() } } })),
          { create: { _id: `pg-${Date.now().toString(36)}-${k}`, _type: T, title: 'pg', body: 'new' } },
        ]);
        concurrentWrites += 6;
        k++;
        await sleep(150);
      }
    })();
    const t0 = performance.now();
    let pages = 0;
    let endCursor;
    if (mode === 'keyset') {
      pages = (await keysetSlow(rep, 120)).pages;
      endCursor = rep.cursor.ts;
    } else {
      endCursor = cursor0;
      for (let off = 0; ; off += 25) {
        const r = await bp.query({ perspective: 'raw', order: '_updatedAt:asc', 'filter[_updatedAt][gt]': cursor0, limit: 25, offset: off });
        pages++;
        for (const d of r.result.documents) {
          rep.apply(d);
          if (d._updatedAt > endCursor) endCursor = d._updatedAt;
        }
        if (!r.result.hasMore) break;
        await sleep(120);
      }
    }
    stop = true;
    await writer;
    const ms = Math.round(performance.now() - t0);
    const truth = await bp.exportAll();
    let lostForever = 0;
    let behindButReachable = 0;
    for (const d of truth) {
      const mine = rep.docs.get(d._id);
      if (mine && mine._rev === d._rev) continue;
      if (d._updatedAt <= endCursor) lostForever++;
      else behindButReachable++;
    }
    // prove it: one more ordinary pull from the walk's end cursor
    rep.cursor = { ts: endCursor, idsAtTs: new Set() };
    await rep.pullChanges();
    const after = await compare(rep);
    res[mode] = { pages, ms, concurrentWrites, lostForever, behindButReachable, afterOneMorePull: after.missing.length + after.wrongRev.length };
  }
  console.log('paging', res);
  return res;
}


// keyset pull with a pause between pages (same algorithm as Replica.pullChanges)
async function keysetSlow(rep, pauseMs) {
  const orig = bp.query;
  let pages = 0;
  // monkey-patch-free: reimplement the loop with a sleep
  let { ts } = rep.cursor;
  let startFrom = ts;
  let offset = 0;
  for (;;) {
    const params = { perspective: 'raw', order: '_updatedAt:asc,_id:asc', limit: rep.pageSize };
    if (startFrom) params['filter[_updatedAt][gte]'] = startFrom;
    if (offset) params.offset = offset;
    const r = await bp.query(params);
    pages++;
    let advanced = false;
    for (const d of r.result.documents) {
      rep.apply(d);
      if (ts === null || d._updatedAt > ts) ts = d._updatedAt;
      if (d._updatedAt !== startFrom) advanced = true;
    }
    if (!r.result.hasMore) break;
    if (advanced) {
      startFrom = ts;
      offset = 0;
    } else offset += r.result.documents.length;
    await sleep(pauseMs);
  }
  rep.cursor = { ts, idsAtTs: new Set() };
  return { pages };
}

// 4. Commit order vs timestamp order. A long mutate transaction stamps its
// first rows early but commits late; short writes commit in between. A reader
// that advances its cursor past them never sees the early rows.
async function race() {
  const lag0 = await syncedReplica({ deletes: 'none' });
  const lag10 = new Replica({ deletes: 'none', lagMs: 10_000 });
  lag10.docs = new Map(lag0.docs);
  lag10.cursor = { ...lag0.cursor };
  const gate0 = new Replica({ deletes: 'countgate', lagMs: 0 });
  gate0.docs = new Map(lag0.docs);
  gate0.cursor = { ...lag0.cursor };
  const drafts = [...lag0.docs.keys()].filter((id) => id.startsWith('drafts.'));
  const tag = `race${Date.now().toString(36)}`;

  // event-id view (dataset stats recent_activity), polled alongside
  const evFirstSeen = new Map(); // event id -> poll index
  let poll = 0;
  const pollEvents = async () => {
    const s = await bp.dataset_stats();
    for (const e of s.recent_activity) if (!evFirstSeen.has(e.id)) evFirstSeen.set(e.id, { poll, doc: e.doc_id, mutation: e.mutation });
    poll++;
  };
  await pollEvents();

  const BIG = Number(process.env.RACE_BIG || 300);
  const bigStart = performance.now();
  let bigEnd = 0;
  const big = bp
    .mutate(Array.from({ length: BIG }, (_, i) => ({ create: { _id: `${tag}-big-${i}`, _type: T, title: 'big', body: 'x'.repeat(2000), seq: i } })))
    .then((r) => {
      bigEnd = performance.now();
      return r;
    });
  let small = 0;
  let pulls = 0;
  const smallIds = [];
  while (!bigEnd) {
    const id = drafts[small % drafts.length];
    await bp.mutate([{ patch: { id, type: T, set: { body: 'race ' + small } } }]);
    smallIds.push(id);
    small++;
    await lag0.pullChanges();
    await lag10.pullChanges();
    await gate0.pullChanges();
    await pollEvents();
    pulls++;
    await sleep(100);
  }
  await big;
  await pollEvents();
  // final pull for both (normal reconnect)
  await lag0.pullChanges();
  await lag10.pullChanges();
  const c0 = await compare(lag0);
  const c10 = await compare(lag10);
  const g0 = await gate0.catchUp();
  const cg0 = await compare(gate0);
  const bigMissing0 = c0.missing.filter((id) => id.includes(`${tag}-big-`)).length;
  const bigMissing10 = c10.missing.filter((id) => id.includes(`${tag}-big-`)).length;

  // event-id holes: an event first seen at poll k with a smaller id than some
  // event already seen at an earlier poll.
  let holes = 0;
  const seen = [...evFirstSeen.entries()].sort((a, b) => a[1].poll - b[1].poll || a[0] - b[0]);
  let maxIdBefore = -1;
  let curPoll = -1;
  let maxIdThroughPrev = -1;
  for (const [id, v] of seen) {
    if (v.poll !== curPoll) {
      maxIdThroughPrev = maxIdBefore;
      curPoll = v.poll;
    }
    if (v.poll > 0 && id < maxIdThroughPrev) holes++;
    maxIdBefore = Math.max(maxIdBefore, id);
  }

  const r = {
    bigBatch: BIG,
    bigTxMs: Math.round(bigEnd - bigStart),
    smallWritesDuringTx: small,
    pullsDuringTx: pulls,
    lag0: { ok: c0.ok, missing: c0.missing.length, bigMissing: bigMissing0, wrongRev: c0.wrongRev.length },
    lag10s: { ok: c10.ok, missing: c10.missing.length, bigMissing: bigMissing10, wrongRev: c10.wrongRev.length },
    lag0PlusCountGateAndIdDiff: { ok: cg0.ok, missing: cg0.missing.length, healedByDiff: g0.staleAfterDiff, requests: g0.requests, ms: g0.ms },
    eventIdHoles: holes,
    eventPolls: poll,
  };
  console.log('race', r);
  return r;
}

const tests = { ties, skew, paging, race };
for (const [name, fn] of Object.entries(tests)) {
  if (which !== 'all' && which !== name) continue;
  bp.resetStats();
  out[name] = await fn();
  out[name].requests = { ...bp.stats };
}
mkdirSync('results', { recursive: true });
writeFileSync(`results/edge-${which}-${out.at.replace(/[:.]/g, '-')}.json`, JSON.stringify(out, null, 1));
