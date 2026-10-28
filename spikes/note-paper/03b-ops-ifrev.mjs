// 03b: edit a draft note through the scoped member-token ops door with ifRev,
// then replay the same (now stale) ifRev and confirm the 412.
import { readFileSync } from 'node:fs';
import { doc, paperOps, show } from './bp.mjs';

const { notes } = JSON.parse(readFileSync(new URL('./.run.json', import.meta.url)));
const para = (id, value) => ({ id, type: 'paragraph', content: [{ type: 'text', value }] });

for (const slug of [`drafts.${notes[0]}`]) {
  const before = (await doc('paper', slug)).json.result;
  const ifRev = before.rev ?? 0; // paper rev is an integer; absent means 0
  console.log(`\n# ${slug}: rev=${before.rev} _rev=${before._rev}`);

  show(`no ifRev`, await paperOps(slug, [{ op: 'append-block', block: para('px', 'unfenced') }]), 400);
  const ok = await paperOps(slug, [{ op: 'append-block', block: para('p2', 'Action: write the spike report by Friday.') }], ifRev);
  show(`append-block ifRev=${ifRev}`, ok, 600);
  const stale = await paperOps(slug, [{ op: 'append-block', block: para('p3', 'This must not land.') }], ifRev);
  show(`STALE ifRev=${ifRev}`, stale, 900);

  const after = (await doc('paper', slug)).json.result;
  console.log(`\n# after: rev=${after.rev} blocks=${after.blocks.map(b => b.id).join(',')} _rev=${after._rev}`);
}
