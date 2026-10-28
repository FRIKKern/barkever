// 04: note -> note links. Two spellings, both through the ops door:
//   a link mark  {type:'link', href:'/papers/<id>'}     (what the canvas picker writes)
//   a wikilink   {type:'wikilink', docId:'<id>', alias}  (Barkdown's [[...]])
// Then ask `backlinks` on each target. All notes are DRAFTS (never published).
import { readFileSync } from 'node:fs';
import { doc, paperOps, req, show, P, DS } from './bp.mjs';

const { notes } = JSON.parse(readFileSync(new URL('./.run.json', import.meta.url)));
const [from, toLink, toWiki] = [notes[1], notes[2], notes[3]]; // roadmap -> hiring, roadmap -> garden

const slug = `drafts.${from}`;
const cur = (await doc('paper', slug)).json.result;
const block = {
  id: 'p-links', type: 'paragraph', content: [
    { type: 'text', value: 'See ' },
    { type: 'link', href: `/papers/${toLink}`, children: [{ type: 'text', value: 'the hiring loop' }] },
    { type: 'text', value: ' and ' },
    { type: 'wikilink', docId: toWiki, target: 'Garden', alias: 'Garden' },
    { type: 'text', value: '.' },
  ],
};
show('append link block', await paperOps(slug, [{ op: 'append-block', block }], cur.rev ?? 0), 300);

for (const [label, id] of [['link-mark target', toLink], ['wikilink target', toWiki]]) {
  for (const q of [id, `drafts.${id}`]) {
    const r = await req('GET', `${P}/v1/data/backlinks/${DS}/${q}`);
    console.log(`\n## backlinks(${label}, ${q}) -> ${r.status} count=${r.json.result?.count}`,
      JSON.stringify(r.json.result?.backlinks?.map(b => ({ id: b._id ?? b.id ?? b.doc_id, title: b.title, via: b.via_field ?? b.kind }))));
  }
}
