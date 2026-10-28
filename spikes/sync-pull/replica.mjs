// In-memory replica that catches up by PULLING changes since a cursor.
//
// Cursor = the server's own `_updatedAt` string (microsecond ISO, e.g.
// "2026-10-28T23:05:33.579177Z") plus the set of `_id`s already applied AT that
// exact timestamp. The pull is a keyset walk over (_updatedAt asc, _id asc)
// using `filter[_updatedAt][gte]`; boundary rows re-read on the next page are
// dropped by the (_id, _rev) check in apply(), so ties on one timestamp are
// never lost and never applied twice. A page that sits entirely on one
// timestamp falls back to offset.
//
// _updatedAt is stamped by the app inside the write transaction, not at commit
// (document.ex:92 timestamps), so a long transaction can surface rows OLDER
// than the cursor after it moved on. Guard: lagMs re-reads a window behind the
// cursor, and/or the count gate + id diff heals what the walk missed.
//
// It never parses the cursor into a JS Date (that truncates to ms).
import * as bp from './bp.mjs';

export class Replica {
  constructor({ pageSize = 1000, lagMs = 0, deletes = 'none' } = {}) {
    this.docs = new Map(); // _id -> { _id, _rev, _updatedAt, ...content }
    this.cursor = { ts: null, idsAtTs: new Set() };
    this.pageSize = pageSize;
    this.lagMs = lagMs; // re-read this window behind the cursor (commit-order safety)
    this.deletes = deletes; // 'none' | 'iddiff' | 'countgate'
  }

  apply(d) {
    const cur = this.docs.get(d._id);
    if (cur && cur._rev === d._rev) return false;
    this.docs.set(d._id, d);
    return true;
  }

  // Changes since the cursor. Returns { pages, applied }.
  async pullChanges() {
    let { ts, idsAtTs } = this.cursor;
    let from = ts;
    if (ts && this.lagMs > 0) {
      // Step back lagMs (string math on the µs part via BigInt epoch-µs).
      from = usToIso(isoToUs(ts) - BigInt(this.lagMs) * 1000n);
    }
    let pages = 0;
    let applied = 0;
    let offset = 0;
    let startFrom = from;
    for (;;) {
      const params = {
        perspective: 'raw',
        order: '_updatedAt:asc,_id:asc',
        limit: this.pageSize,
      };
      if (startFrom) params['filter[_updatedAt][gte]'] = startFrom;
      if (offset) params.offset = offset;
      const r = await bp.query(params);
      pages++;
      const rows = r.result.documents;
      let advanced = false;
      for (const d of rows) {
        if (this.apply(d)) applied++;
        if (ts === null || d._updatedAt > ts) {
          ts = d._updatedAt;
          idsAtTs = new Set();
        }
        if (d._updatedAt === ts) idsAtTs.add(d._id);
        if (d._updatedAt !== startFrom) advanced = true;
      }
      if (!r.result.hasMore) break;
      if (advanced) {
        // keyset: restart from the newest ts seen; boundary rows get re-read once
        // and are skipped by the (_id,_rev) dedupe in apply().
        startFrom = ts;
        offset = 0;
      } else {
        // a full page all on ONE timestamp: only offset can get past it
        offset += rows.length;
      }
    }
    this.cursor = { ts, idsAtTs };
    return { pages, applied };
  }

  // Deletes are invisible to a changes query (the row is gone). Option: diff
  // the full id+rev set against the server. One GROQ request per 10k docs.
  async diffIds() {
    const ids = new Map();
    let pages = 0;
    const PAGE = 5000;
    for (let start = 0; ; start += PAGE) {
      const r = await bp.groq(
        `*[_type == $t] | order(_id asc)[${start}...${start + PAGE}]{_id,_rev}`,
        { t: bp.TYPE },
        'raw',
      );
      pages++;
      for (const d of r.result) ids.set(d._id, d._rev);
      if (r.result.length < PAGE) break;
    }
    let removed = 0;
    const stale = [];
    for (const id of this.docs.keys()) {
      if (!ids.has(id)) {
        this.docs.delete(id);
        removed++;
      }
    }
    for (const [id, rev] of ids) {
      const cur = this.docs.get(id);
      if (!cur || cur._rev !== rev) stale.push(id);
    }
    // Self-heal: rows the walk missed (e.g. the commit-order race) or holds at
    // an old rev are fetched by id.
    for (let i = 0; i < stale.length; i += 500) {
      const r = await bp.groq('*[_id in $ids]', { ids: stale.slice(i, i + 500) }, 'raw');
      pages++;
      for (const d of r.result) this.apply(d);
    }
    return { pages, removed, stale };
  }

  async catchUp() {
    const t0 = performance.now();
    const before = bp.stats.requests;
    const bytes0 = bp.stats.bytes;
    const ch = await this.pullChanges();
    let del = null;
    if (this.deletes === 'iddiff') del = await this.diffIds();
    if (this.deletes === 'countgate') {
      // After the pull the replica holds every live row plus ghosts, so the
      // counts differ iff something was deleted. 1 tiny request when clean.
      const r = await bp.groq('count(*[_type == $t])', { t: bp.TYPE }, 'raw');
      if (r.result !== this.docs.size) del = await this.diffIds();
      else del = { pages: 1, removed: 0, stale: [] };
    }
    return {
      ms: Math.round(performance.now() - t0),
      requests: bp.stats.requests - before,
      kb: Math.round((bp.stats.bytes - bytes0) / 1024),
      changePages: ch.pages,
      applied: ch.applied,
      removed: del?.removed ?? 0,
      diffPages: del?.pages ?? 0,
      staleAfterDiff: del?.stale.length ?? null,
    };
  }
}

// Compare replica to server truth (export, raw perspective).
export async function compare(replica) {
  const truth = await bp.exportAll();
  const t = new Map(truth.map((d) => [d._id, d._rev]));
  const missing = []; // on server, not in replica
  const wrongRev = [];
  const ghosts = []; // in replica, gone on server (missed deletes)
  for (const [id, rev] of t) {
    const r = replica.docs.get(id);
    if (!r) missing.push(id);
    else if (r._rev !== rev) wrongRev.push(id);
  }
  for (const id of replica.docs.keys()) if (!t.has(id)) ghosts.push(id);
  return {
    ok: missing.length + wrongRev.length + ghosts.length === 0,
    serverRows: t.size,
    replicaRows: replica.docs.size,
    missing,
    wrongRev,
    ghosts,
  };
}

// ISO (µs) <-> BigInt epoch microseconds, without going through Date's ms.
export function isoToUs(iso) {
  const m = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?Z$/.exec(iso);
  if (!m) throw new Error('bad ts ' + iso);
  const sec = BigInt(Date.parse(m[1] + 'Z')) / 1000n;
  const frac = BigInt((m[2] || '').padEnd(6, '0'));
  return sec * 1000000n + frac;
}
export function usToIso(us) {
  const sec = us / 1000000n;
  const frac = (us % 1000000n).toString().padStart(6, '0');
  return new Date(Number(sec) * 1000).toISOString().replace(/\.\d{3}Z$/, `.${frac}Z`);
}
