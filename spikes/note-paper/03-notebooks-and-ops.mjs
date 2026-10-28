// 03: two notebooks in one stack, five draft notes across them, list per notebook,
// then edit one note through the Bulldocs ops door with ifRev and replay a stale rev.
// First run hit the flat /v1/plugins/bulldocs door and got 404 for all three ops
// (it cannot see the barkever workspace); bp.mjs now uses the scoped door — see 03b.
import { writeFileSync } from 'node:fs';
import { doc, mutate, paperOps, req, show, P, DS } from './bp.mjs';

const para = (id, value) => ({ id, type: 'paragraph', content: [{ type: 'text', value }] });
const run = Date.now().toString(36);

// Notebooks are their own small type; the stack is a string on the notebook.
const nbs = [
  { _id: `nb-work-${run}`, title: 'Work', stack: 'Life' },
  { _id: `nb-home-${run}`, title: 'Home', stack: 'Life' },
];
show('create 2 notebooks', await mutate(nbs.map(n => ({ createOrReplace: { _type: 'notebook', ...n } }))), 300);

// Each note carries BOTH spellings of membership to see which the server indexes:
//   notebook:    plain id string  (query filter)
//   notebookRef: {_ref}           (backlinks from the notebook)
const notes = [
  ['Standup notes', 'Ship the sync spike; review the paper canvas.', 0],
  ['Q4 roadmap', 'Barkever beta, Mac app signing, search.', 0],
  ['Hiring loop', 'Two interviews on Thursday for the platform role.', 0],
  ['Garden', 'Plant garlic before the first frost; buy mulch.', 1],
  ['Recipes', 'Rye bread: 500 g flour, 350 g water, levain overnight.', 1],
].map(([title, text, nb], i) => ({
  _id: `note-${run}-${i}`, _type: 'paper', title,
  blocks: [para('p1', text)],
  notebook: nbs[nb]._id, notebookRef: { _ref: nbs[nb]._id },
}));
const created = await mutate(notes.map(n => ({ create: n })));
console.log('\n## create 5 notes ->', created.status, created.json.results?.map(r => r.id).join(', '),
  '| warnings:', JSON.stringify(created.json.warnings?.map(w => w.message.slice(0, 160))));

for (const nb of nbs) {
  const q = await req('GET', `${P}/v1/data/query/${DS}/paper?perspective=drafts&filter[notebook]=${nb._id}&fields=title,notebook`);
  console.log(`\n## notes in ${nb.title} (filter[notebook]) -> ${q.status}`, q.json.result?.documents?.map(d => d.title));
  const bl = await req('GET', `${P}/v1/data/backlinks/${DS}/${nb._id}`);
  console.log(`## backlinks of ${nb.title} (via notebookRef) -> ${bl.status}`, bl.json.result?.backlinks?.map(d => d.title ?? d._id), bl.json.result?.count);
}
const stack = await req('GET', `${P}/v1/data/query/${DS}/notebook?perspective=drafts&filter[stack]=Life&fields=title,stack`);
console.log('\n## notebooks in stack Life ->', stack.status, stack.json.result?.documents?.map(d => d.title));

// ---- ops door with ifRev -------------------------------------------------
const target = `drafts.${notes[0]._id}`;
const before = (await doc('paper', target)).json.result;
console.log('\n## before edit: _rev', before._rev, '| rev (paper int)', before.rev);
const ifRev = before.rev ?? 0;
const edit = await paperOps(target, [
  { op: 'append-block', block: para('p2', 'Action: write the spike report by Friday.') },
], ifRev);
show(`ops door append-block with ifRev=${ifRev}`, edit, 600);

const stale = await paperOps(target, [
  { op: 'append-block', block: para('p3', 'This must not land.') },
], ifRev);
show(`ops door replay with STALE ifRev=${ifRev}`, stale, 600);

const noFence = await paperOps(target, [{ op: 'append-block', block: para('p4', 'Unfenced write.') }]);
show('ops door with NO ifRev at all', noFence, 300);

const after = (await doc('paper', target)).json.result;
console.log('\n## after: rev', after.rev, '| blocks', after.blocks.map(b => b.id).join(','), '| _rev', after._rev);

writeFileSync(new URL('./.run.json', import.meta.url), JSON.stringify({ run, nbs: nbs.map(n => n._id), notes: notes.map(n => n._id) }, null, 1));
