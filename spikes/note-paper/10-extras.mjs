// 10: what Papers give for free. Never prints a minted token.
//  - anonymous read of a published note vs a draft note (paper schema is public)
//  - the scoped HTML reader for a published note
//  - `bp paper view` (terminal reader) against this workspace/dataset
//  - a draft preview link (minted, keys listed, revoked)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { req, BASE, P, DS } from './bp.mjs';

const { notes } = JSON.parse(readFileSync(new URL('./.run.json', import.meta.url)));
const published = notes[1];            // "Q4 roadmap", published in 04c
const draft = notes[3];                // "Garden", draft only

for (const [label, id] of [['published', published], ['draft', `drafts.${draft}`], ['draft (bare id)', draft]]) {
  const r = await req('GET', `${P}/v1/data/doc/${DS}/paper/${id}`, undefined, { auth: false });
  console.log(`anonymous GET ${label} -> ${r.status} ${r.json.result?.title ?? r.json.error?.code ?? ''}`);
}
for (const path of [`/w/barkever/p/default/d/${DS}/papers/${published}`, `/w/barkever/p/default/d/${DS}/papers/${draft}`]) {
  const res = await fetch(BASE + path);
  const html = await res.text();
  console.log(`anonymous reader ${path} -> ${res.status} has-title=${html.includes('Q4 roadmap')} bytes=${html.length}`);
}

const bp = (...args) => { try { return execFileSync('bp', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return `EXIT ${e.status}: ${(e.stdout || '') + (e.stderr || '')}`; } };
console.log('\nbp paper view (first lines):\n' + bp('paper', 'view', published, '-w', 'barkever', '-d', DS).split('\n').slice(0, 12).join('\n'));

const mint = bp('share', 'preview-link-mint', 'barkever', draft, 'paper', '--ttl', '1h', '--label', 'spike-b', '-w', 'barkever', '-d', DS, '--yes', '-o', 'json');
let minted; try { minted = JSON.parse(mint); } catch { console.log('\npreview-link-mint ->', mint.replace(/[A-Za-z0-9_-]{24,}/g, '<redacted>').slice(0, 600)); }
if (minted) {
  const row = minted.result ?? minted.link ?? minted;
  console.log('\npreview-link-mint -> ok, keys:', Object.keys(row).join(','));
  const id = row.id ?? row.link?.id;
  if (id) console.log('revoke ->', bp('share', 'preview-link-revoke', id, '-w', 'barkever', '--yes', '-o', 'json').slice(0, 200));
}
