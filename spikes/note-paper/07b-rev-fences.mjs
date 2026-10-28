// 07b: papers carry TWO revision counters: `_rev` (hash, every write, used by
// mutate ifRevisionID) and `rev` (integer, used by the ops door ifRev).
// (a) does a mutate patch bump `rev`?  (b) restore reset rev to an older value
// in 07; does a client holding that OLD rev now pass the fence (ABA)?
import { readFileSync } from 'node:fs';
import { doc, mutate, paperOps, req, P, DS } from './bp.mjs';

const { notes } = JSON.parse(readFileSync(new URL('./.run.json', import.meta.url)));
const id = `drafts.${notes[2]}`;
const cur = async () => { const d = (await doc('paper', id)).json.result; return { rev: d.rev ?? 0, _rev: d._rev, title: d.title, n: d.blocks.length }; };
const para = (bid, value) => ({ id: bid, type: 'paragraph', content: [{ type: 'text', value }] });

const a0 = await cur();
console.log('(a) start', a0);
await mutate([{ patch: { id, type: 'paper', set: { title: 'Hiring loop (renamed)' } } }]);
const a1 = await cur();
console.log('(a) after mutate title patch', a1, a1.rev === a0.rev ? '=> int rev NOT bumped by mutate' : '=> bumped');
const stale = await paperOps(id, [{ op: 'append-block', block: para('pz', 'written by a client that never saw the rename') }], a0.rev);
console.log('(a) ops with pre-rename ifRev ->', stale.status, stale.json.error?.code ?? `rev ${stale.json.rev}`);
console.log('(a) title now', (await cur()).title);

// (b) ABA: edit -> restore older revision -> old rev number is valid again.
const b0 = await cur();
await paperOps(id, [{ op: 'append-block', block: para('pb1', 'edit A') }], b0.rev);
const hist = (await req('GET', `${P}/v1/data/history/${DS}/paper/${id}?limit=1`)).json.revisions;
const before = (await req('GET', `${P}/v1/data/history/${DS}/paper/${id}?limit=2`)).json.revisions[1];
await req('POST', `${P}/v1/data/revision/${DS}/${before.id}/restore`, { type: 'paper' });
const b1 = await cur();
console.log('\n(b) held rev', b0.rev, '| after edit+restore rev', b1.rev, '| latest history row', hist?.[0]?.action);
const aba = await paperOps(id, [{ op: 'append-block', block: para('pb2', 'client still holding the old rev') }], b0.rev);
console.log('(b) ops with the held (pre-edit) rev ->', aba.status, aba.json.error?.code ?? `accepted, rev ${aba.json.rev}`);
