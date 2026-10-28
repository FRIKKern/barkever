// 01c: register two tags in the dataset, publish the note, then try the dedup wall
// with a second near-identical note (two grocery lists is normal in a notes app).
import { randomUUID } from 'node:crypto';
import { doc, mutate, show } from './bp.mjs';

const id = process.argv[2];
// `publish: true` is refused for type tag (422), so: createOrReplace, then publish.
for (const name of ['groceries', 'personal']) {
  show(`tag ${name}: create`, await mutate([{ createOrReplace: { _id: name, _type: 'tag', title: name } }]), 200);
  show(`tag ${name}: publish`, await mutate([{ publish: { id: name, type: 'tag' } }]), 600);
}
show('publish note', await mutate([{ publish: { id, type: 'paper' } }]), 1200);
show('published read', await doc('paper', id, 'published'), 500);

// Second note, same shape: a normal week in a notes app.
const id2 = `note-${randomUUID()}`;
const d = (await doc('paper', id, 'drafts')).json.result;
await mutate([{ create: { _id: id2, _type: 'paper', title: d.title, blocks: d.blocks,
  description: d.description, tags: d.tags } }]);
show('publish near-duplicate note', await mutate([{ publish: { id: id2, type: 'paper' } }]), 1500);
console.log('\nDUP_ID', id2);
