import {readFileSync} from 'node:fs'
import {call, DATASET} from './bp.mjs'

for (const name of ['notebook', 'note']) {
  const schema = readFileSync(new URL(`../../contracts/barkpark/${name}.json`, import.meta.url), 'utf8')
  console.log(`schema ${name} → ${(await call('POST', `/v1/schemas/${DATASET}`, schema)).status}`)
}
