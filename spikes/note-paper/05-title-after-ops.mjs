// 05: what happens to a note's `title` field when the ops door edits it?
// Paper titles are derived from a locked title heading (block 0, role:"title").
// A note with no such heading: compare title before and after one op.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { doc, mutate, paperOps } from './bp.mjs';

const { notes } = JSON.parse(readFileSync(new URL('./.run.json', import.meta.url)));
for (const id of notes) {
  const d = (await doc('paper', `drafts.${id}`)).json.result;
  console.log(`${id}: title=${JSON.stringify(d.title)} rev=${d.rev ?? 0} blocks=${d.blocks.length}`);
}

const para = (id, value) => ({ id, type: 'paragraph', content: [{ type: 'text', value }] });
const titleBlock = (text) => ({ id: 'tpl-title', type: 'heading', level: 1, role: 'title', locked: true, text });

for (const [label, blocks] of [
  ['plain body, title field only', [para('p1', 'body')]],
  ['locked title heading (Barkdown shape)', [titleBlock('Title in heading'), para('p1', 'body')]],
]) {
  const id = `note-${randomUUID()}`;
  await mutate([{ create: { _id: id, _type: 'paper', title: 'Title in field', blocks } }]);
  const t0 = (await doc('paper', `drafts.${id}`)).json.result.title;
  const r = await paperOps(`drafts.${id}`, [{ op: 'append-block', block: para('p9', 'typed later') }], 0);
  const t1 = (await doc('paper', `drafts.${id}`)).json.result.title;
  console.log(`\n[${label}] create title=${JSON.stringify(t0)} -> after op (HTTP ${r.status}) title=${JSON.stringify(t1)}`);
}
