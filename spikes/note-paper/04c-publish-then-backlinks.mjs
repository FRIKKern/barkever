// 04c: repair titles that the ops door overwrote (05), using the paper template
// (locked h1 role:title at block 0). Then publish the linking note and see whether
// body links (link mark, wikilink) reach `backlinks` once the source is published.
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { doc, mutate, req, P, DS } from './bp.mjs';

const { notes } = JSON.parse(readFileSync(new URL('./.run.json', import.meta.url)));
const titles = ['Standup notes', 'Q4 roadmap', 'Hiring loop', 'Garden', 'Recipes'];
const titleBlock = (text) => ({ id: 'tpl-title', type: 'heading', level: 1, role: 'title', locked: true, text });

for (const [i, id] of notes.entries()) {
  const d = (await doc('paper', `drafts.${id}`)).json.result;
  if (d.title === titles[i]) continue; // mutate does not re-derive title from blocks: set both
  const r = await mutate([{ patch: { id: `drafts.${id}`, type: 'paper', ifRevisionID: d._rev,
    set: { title: titles[i], blocks: d.blocks[0]?.role === 'title' ? d.blocks : [titleBlock(titles[i]), ...d.blocks] } } }]);
  const t = (await doc('paper', `drafts.${id}`)).json.result.title;
  console.log(`title repair ${id} -> ${r.status} title=${JSON.stringify(t)}`);
}

const from = notes[1];
const set = { description: 'Quarterly roadmap for the Barkever beta.',
  tags: [{ tag: 'personal', strength: 30, rationale: 'Spike fixture for the backlinks test.' }] };
console.log('patch labels ->', (await mutate([{ patch: { id: `drafts.${from}`, type: 'paper', set } }])).status);
const pub = await mutate([{ publish: { id: from, type: 'paper' } }]);
console.log('publish linking note ->', pub.status, pub.json.error?.code ?? 'ok', JSON.stringify(pub.json.error?.details ?? pub.json.warnings?.map(w => w.code)));

for (let t = 0; t < 3; t++) {
  await sleep(2000);
  for (const [label, id] of [['link-mark', notes[2]], ['wikilink', notes[3]], ['related', notes[4]]]) {
    const r = await req('GET', `${P}/v1/data/backlinks/${DS}/${id}`);
    console.log(`t+${2 * (t + 1)}s ${label} backlinks(${id}) count=${r.json.result?.count}`,
      JSON.stringify(r.json.result?.backlinks?.map(b => ({ title: b.title, via: b.via_field, src: b.plugin_source }))));
  }
}
