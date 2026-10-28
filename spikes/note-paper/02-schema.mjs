// 02: the dataset starts with NO schemas. Register the upstream `paper` schema
// verbatim (copied from barkpark api/priv/plugins/bulldocs/schemas/paper.json)
// plus a tiny `notebook` type. Drafts worked without either (see 01).
import { readFileSync } from 'node:fs';
import { req, P, DS, show } from './bp.mjs';

const paper = JSON.parse(readFileSync(new URL('./paper.schema.json', import.meta.url)));
const notebook = {
  name: 'notebook', title: 'Notebooks', icon: '📓', visibility: 'private',
  fields: [
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'stack', title: 'Stack', type: 'string' },
  ],
};
show('apply paper schema', await req('POST', `${P}/v1/schemas/${DS}`, paper), 400);
show('apply notebook schema', await req('POST', `${P}/v1/schemas/${DS}`, notebook), 400);
const ls = await req('GET', `${P}/v1/schemas/${DS}`);
console.log('\nschemas now:', ls.json.schemas?.map(s => `${s.name}(${s.visibility})`).join(', '));
