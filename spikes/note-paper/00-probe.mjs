// 00: does the dataset exist, and does it carry the `paper` schema?
import { req, P, DS, show } from './bp.mjs';

show('schemas in dataset', await req('GET', `${P}/v1/schemas/${DS}`), 600);
show('paper schema', await req('GET', `${P}/v1/schemas/${DS}/paper`), 600);
show('paper query', await req('GET', `${P}/v1/data/query/${DS}/paper?perspective=drafts&limit=5`), 600);
