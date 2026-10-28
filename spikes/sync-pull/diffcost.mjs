// Cost of the delete fix "full id+rev diff" as the dataset grows.
// usage: node diffcost.mjs <targetRows>
import { writeFileSync, mkdirSync } from 'node:fs';
import * as bp from './bp.mjs';
import { Replica } from './replica.mjs';
import { seed } from './changes.mjs';

const target = Number(process.argv[2] || 10000);
let rows = (await bp.groq('count(*[_type == $t])', { t: bp.TYPE }, 'raw')).result;
if (rows < target) {
  console.log(`seeding ${target - rows}`);
  await seed(target - rows, `big${Date.now().toString(36)}`);
  rows = (await bp.groq('count(*[_type == $t])', { t: bp.TYPE }, 'raw')).result;
}
const rep = new Replica({ deletes: 'iddiff' });
bp.resetStats();
let t0 = performance.now();
await rep.pullChanges();
const fullMs = Math.round(performance.now() - t0);
const full = { ms: fullMs, requests: bp.stats.requests, kb: Math.round(bp.stats.bytes / 1024) };

const runs = [];
for (let i = 0; i < 3; i++) {
  bp.resetStats();
  t0 = performance.now();
  const d = await rep.diffIds();
  runs.push({ ms: Math.round(performance.now() - t0), requests: bp.stats.requests, kb: Math.round(bp.stats.bytes / 1024), removed: d.removed, stale: d.stale.length });
}
// the alternative id list: REST query, fields projection, 1000/page
bp.resetStats();
t0 = performance.now();
let n = 0;
for (let off = 0; ; off += 1000) {
  const r = await bp.query({ perspective: 'raw', fields: 'seq', order: '_id:asc', limit: 1000, offset: off });
  n += r.result.documents.length;
  if (!r.result.hasMore) break;
}
const rest = { ms: Math.round(performance.now() - t0), requests: bp.stats.requests, kb: Math.round(bp.stats.bytes / 1024), rows: n };
const out = { at: new Date().toISOString(), rows, initialFullPull: full, groqIdDiff: runs, restIdList: rest };
console.log(JSON.stringify(out, null, 1));
mkdirSync('results', { recursive: true });
writeFileSync(`results/diffcost-${rows}-${out.at.replace(/[:.]/g, '-')}.json`, JSON.stringify(out, null, 1));
