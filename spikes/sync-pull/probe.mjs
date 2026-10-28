// Probe: what does Barkpark hand a pull client? Timestamp precision, ordering,
// filters, GROQ, what a delete/publish leaves behind.
import * as bp from './bp.mjs';

const log = (label, v) => console.log(`\n## ${label}\n` + JSON.stringify(v, null, 1).slice(0, 2500));

const r1 = await bp.mutate([
  { createOrReplace: { _id: 'probe-a', _type: bp.TYPE, title: 'A', body: 'a' } },
  { createOrReplace: { _id: 'probe-b', _type: bp.TYPE, title: 'B', body: 'b' } },
  { createOrReplace: { _id: 'probe-c', _type: bp.TYPE, title: 'C', body: 'c' } },
]);
log('mutate batch of 3: ids/_updatedAt', r1.results.map((r) => [r.id, r.operation, r.document?._updatedAt, r.document?._rev]));

const q1 = await bp.query({ perspective: 'raw', order: '_updatedAt:asc', limit: 10 });
log('query raw order asc', { keys: Object.keys(q1.result), docs: q1.result.documents.map((d) => [d._id, d._updatedAt, d._rev]) });

const ts = q1.result.documents[0]?._updatedAt;
const q2 = await bp.query({ perspective: 'raw', order: '_updatedAt:asc', 'filter[_updatedAt][gt]': ts, limit: 10 });
log(`filter _updatedAt gt ${ts}`, q2.result.documents.map((d) => [d._id, d._updatedAt]));

const q3 = await bp.query({ perspective: 'raw', order: '_updatedAt:asc,_id:asc', limit: 10 });
log('order _updatedAt:asc,_id:asc', q3.result.documents.map((d) => [d._id, d._updatedAt]));

const g1 = await bp.groq('*[_type == $t && _updatedAt > $ts] | order(_updatedAt asc, _id asc)[0...10]{_id,_rev,_updatedAt}', { t: bp.TYPE, ts });
log('groq _updatedAt > ts', g1);

// publish probe-a: draft row drafts.probe-a? createOrReplace writes the draft row.
const r2 = await bp.mutate([{ publish: { id: 'probe-a', type: bp.TYPE } }]);
log('publish probe-a', r2.results.map((r) => [r.id, r.operation, r.document?._updatedAt]));
const r3 = await bp.mutate([{ delete: { id: 'probe-b', type: bp.TYPE } }]);
log('delete probe-b', r3.results.map((r) => [r.id, r.operation]));

const q4 = await bp.query({ perspective: 'raw', order: '_updatedAt:asc', limit: 50 });
log('after publish+delete raw', q4.result.documents.map((d) => [d._id, d._updatedAt, d._draft]));

const h = await bp.history('probe-b').catch((e) => e.message);
log('history of deleted probe-b', h);

const all = await bp.exportAll();
log('export raw', all.map((d) => [d._id, d._updatedAt]));
log('stats', bp.stats);
