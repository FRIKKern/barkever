import { readFileSync } from 'node:fs'
import { bp, DATASET, mutate } from './bp.mjs'

const which = process.argv[2] ?? 'all'
const here = new URL('.', import.meta.url)
for (const name of ['notebook', 'note']) {
  const r = await bp('POST', `/v1/schemas/${DATASET}`, JSON.parse(readFileSync(new URL(`../../contracts/barkpark/${name}.json`, here), 'utf8')))
  console.log(`schema ${name} → ${r.status}`)
}
const sets = which === 'all' ? ['50', '5000'] : [which]
for (const set of sets) {
  const docs = readFileSync(new URL(`data/notes-${set}.ndjson`, here), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const t0 = performance.now()
  for (let i = 0; i < docs.length; i += 100) {
    const r = await mutate(docs.slice(i, i + 100).map((d) => ({ createOrReplace: d })))
    if (r.status !== 200) throw new Error(`mutate ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`)
  }
  console.log(`seed ${set}: ${docs.length} docs in ${Math.round(performance.now() - t0)} ms`)
}
