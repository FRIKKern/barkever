// 04b: the body links from 04 showed 0 backlinks while every note is a draft.
// (1) wait and re-ask (is edge projection async?)
// (2) the schema-declared ref: paper.related[] (refType paper) on a draft
// (3) publish the linking note and re-ask
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { mutate, req, P, DS } from './bp.mjs';

const { notes } = JSON.parse(readFileSync(new URL('./.run.json', import.meta.url)));
const [from, toLink, toWiki, toRelated] = [notes[1], notes[2], notes[3], notes[4]];
const bl = async (label, id) => {
  const r = await req('GET', `${P}/v1/data/backlinks/${DS}/${id}`);
  console.log(`## ${label} backlinks(${id}) -> ${r.status} count=${r.json.result?.count}`,
    JSON.stringify(r.json.result?.backlinks?.map(b => ({ title: b.title, via: b.via_field, src: b.plugin_source }))));
};

await sleep(5000);
console.log('# (1) after 5 s');
await bl('link-mark', toLink); await bl('wikilink', toWiki);

console.log('\n# (2) related[] ref on the draft');
const p = await mutate([{ patch: { id: `drafts.${from}`, type: 'paper', set: { related: [{ _ref: toRelated }] } } }]);
console.log('patch related ->', p.status, p.json.error?.message ?? '');
await bl('related', toRelated);

console.log('\n# (3) publish the linking note (description + registered tags)');
const pub = await mutate([
  { patch: { id: `drafts.${from}`, type: 'paper', set: { description: 'Quarterly roadmap for the Barkever beta.',
    tags: [{ tag: 'personal', strength: 30, rationale: 'Spike fixture.' }] } } },
  { publish: { id: from, type: 'paper' } },
]);
console.log('publish ->', pub.status, pub.json.error?.code ?? '', pub.json.error?.message ?? '');
await sleep(3000);
await bl('link-mark', toLink); await bl('wikilink', toWiki); await bl('related', toRelated);
