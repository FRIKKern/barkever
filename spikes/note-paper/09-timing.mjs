// 09: quick-capture round trips from this Mac to guerrilla.barkpark.cloud.
// create = one mutate `create` of a draft paper (title heading + one paragraph).
// edit   = one ops-door append on that note with ifRev 0.
import { randomUUID } from 'node:crypto';
import { mutate, paperOps } from './bp.mjs';

const para = (id, value) => ({ id, type: 'paragraph', content: [{ type: 'text', value }] });
const title = (text) => ({ id: 'tpl-title', type: 'heading', level: 1, role: 'title', locked: true, text });
const stats = (xs) => { const s = [...xs].sort((a, b) => a - b); const q = p => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  return `n=${s.length} median=${q(0.5).toFixed(0)} ms p95=${q(0.95).toFixed(0)} ms min=${s[0].toFixed(0)} max=${s.at(-1).toFixed(0)}`; };

const create = [], edit = [];
for (let i = 0; i < 10; i++) {
  const id = `note-t-${randomUUID()}`;
  const c = await mutate([{ create: { _id: id, _type: 'paper', title: `Quick ${i}`, blocks: [title(`Quick ${i}`), para('p1', 'captured')] } }]);
  if (c.status !== 200) throw new Error(`create ${c.status}`);
  create.push(c.ms);
  const e = await paperOps(`drafts.${id}`, [{ op: 'append-block', block: para('p2', 'and one more line') }], 0);
  if (e.status !== 200) throw new Error(`edit ${e.status}`);
  edit.push(e.ms);
}
console.log('create draft note:', stats(create));
console.log('ops-door edit    :', stats(edit));
console.log('raw create ms    :', create.map(x => x.toFixed(0)).join(' '));
console.log('raw edit ms      :', edit.map(x => x.toFixed(0)).join(' '));
