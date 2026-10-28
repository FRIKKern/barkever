// 01b: what does it take to PUBLISH a note-paper? Add a description, then tags.
import { doc, mutate, show, req, P, DS } from './bp.mjs';

const id = process.argv[2];
if (!id) throw new Error('usage: node 01b-publish.mjs <note-id>');
const d = (await doc('paper', `drafts.${id}`)).json.result;

const patch = (set) => mutate([{ patch: { id: `drafts.${id}`, type: 'paper', set } }]);
const publish = () => mutate([{ publish: { id, type: 'paper' } }]);

show('+description', await patch({ description: 'A short grocery list for the weekend shop.' }), 300);
show('publish (description, no tags)', await publish(), 1500);

const tags = [
  { tag: 'groceries', strength: 80, rationale: 'The note is a shopping list.' },
  { tag: 'personal', strength: 40, rationale: 'Household errand, not work.' },
];
show('+tags', await patch({ tags }), 300);
show('publish (description + 2 tags)', await publish(), 2000);
show('validate door (flat)', await req('POST', `/v1/plugins/bulldocs/papers/validate`,
  { slug: id, title: d.title, blocks: d.blocks, dataset: DS, workspace: 'barkever', project: 'default' }), 2000);
