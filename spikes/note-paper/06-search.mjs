// 06: full-text search finds a DRAFT note by a word that appears only in its body.
// Also: a word added through the ops door (is the index updated on op writes?).
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { req, P, DS } from './bp.mjs';

const search = async (q, extra = '') => {
  const r = await req('GET', `${P}/v1/data/search/${DS}?q=${encodeURIComponent(q)}&type=paper&perspective=drafts&limit=10${extra}`);
  const rows = r.json.documents ?? []; // search answers top-level {count, documents}, not {result}
  console.log(`search "${q}"${extra} -> ${r.status} ${Math.round(r.ms)} ms`,
    Array.isArray(rows) ? JSON.stringify(rows.map(d => ({ id: d._id, title: d.title }))) : JSON.stringify(r.json).slice(0, 400));
};

await search('garlic');          // body of "Garden" (created via mutate)
await search('levain');          // body of "Recipes"
await search('Friday');          // appended to "Standup notes" via ops door in 03b
await search('sourdough');       // the published grocery notes from 01
await search('garlik');          // typo
await sleep(1500);
await search('Friday', '&engine=indx');
