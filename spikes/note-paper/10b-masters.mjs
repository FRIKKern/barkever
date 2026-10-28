// 10b: paper masters (reusable blocks / note templates) on a draft note, scoped door.
import { readFileSync } from 'node:fs';
import { req, show, P, DS } from './bp.mjs';

const { notes } = JSON.parse(readFileSync(new URL('./.run.json', import.meta.url)));
show('masters available to a draft note', await req('GET', `${P}/v1/papers/drafts.${notes[3]}/masters?dataset=${DS}`), 600);
show('masters available to a published note', await req('GET', `${P}/v1/papers/${notes[1]}/masters?dataset=${DS}`), 600);
