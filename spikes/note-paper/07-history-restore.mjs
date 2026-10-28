// 07: history lists a draft note's revisions; restoring the first one brings back
// the original body (one paragraph, no "Friday" line, no title heading).
import { readFileSync } from 'node:fs';
import { doc, req, show, P, DS } from './bp.mjs';

const { notes } = JSON.parse(readFileSync(new URL('./.run.json', import.meta.url)));
const id = `drafts.${notes[0]}`;
const summary = (d) => `title=${JSON.stringify(d.title)} rev=${d.rev ?? 0} blocks=[${d.blocks.map(b => b.id).join(',')}]`;

console.log('now:', summary((await doc('paper', id)).json.result));
for (const hid of [id, notes[0]]) {
  const h = await req('GET', `${P}/v1/data/history/${DS}/paper/${hid}`);
  console.log(`\nhistory(${hid}) -> ${h.status} count=${h.json.count}`);
  for (const r of h.json.revisions ?? []) console.log(' ', r.timestamp, r.action, r.rev, r.id);
}
const h = (await req('GET', `${P}/v1/data/history/${DS}/paper/${id}`)).json.revisions ?? [];
const oldest = h.at(-1);
if (oldest) {
  const rv = await req('GET', `${P}/v1/data/revision/${DS}/${oldest.id}`);
  const c = rv.json.revision ?? rv.json.result?.revision ?? {};
  console.log(`\nrevision ${oldest.id} -> ${rv.status} blocks=[${(c.blocks ?? c.content?.blocks ?? []).map(b => b.id).join(',')}]`);
  const res = await req('POST', `${P}/v1/data/revision/${DS}/${oldest.id}/restore`, { type: 'paper' });
  show('restore oldest', res, 500);
  console.log('after restore:', summary((await doc('paper', id)).json.result));
}
