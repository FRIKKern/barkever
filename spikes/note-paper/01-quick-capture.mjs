// 01: can a note live as a Paper DRAFT with no tags and no description?
// Then: what does publishing it take?
import { randomUUID } from 'node:crypto';
import { doc, mutate, show, req, P, DS } from './bp.mjs';

const para = (id, value) => ({ id, type: 'paragraph', content: [{ type: 'text', value }] });
const id = `note-${randomUUID()}`;

const created = await mutate([{ create: {
  _id: id, _type: 'paper', title: 'Groceries',
  blocks: [para('b1', 'milk, eggs, sourdough')],
} }]);
show('create draft paper (no tags, no description)', created, 1200);

const read = await doc('paper', `drafts.${id}`);
show('read back drafts.<id>', read, 900);

// A bare-minimum draft: no title, no blocks at all (the Cmd-N moment).
const bare = `note-${randomUUID()}`;
show('create empty draft (no title, no blocks)', await mutate([{ create: { _id: bare, _type: 'paper' } }]), 700);
show('create draft with title only, blocks: []', await mutate([{ create: { _id: `note-${randomUUID()}`, _type: 'paper', title: 'x', blocks: [] } }]), 700);

// Publish the draft: does the wall stop a tagless, description-less note?
show('publish draft (mutate publish)', await mutate([{ publish: { id, type: 'paper' } }]), 1800);
show('publish dry run via validate door', await req('POST', `${P}/v1/plugins/bulldocs/papers/validate?dataset=${DS}`,
  { slug: id, title: 'Groceries', blocks: [para('b1', 'milk, eggs, sourdough')], dataset: DS }), 2500);
console.log('\nNOTE_ID', id, 'BARE_ID', bare);
