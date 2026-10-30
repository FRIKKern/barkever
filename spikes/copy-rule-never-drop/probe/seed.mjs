import {readFileSync} from 'node:fs'
import {bp} from './bp.mjs'
const ds = process.argv[2]
if (!/^probe-b-\d+$/.test(ds)) throw new Error('probe-r5-<n> only')
const repo = (p) => new URL(`file://../barkever/${p}`)
for (const type of ['notebook', 'note']) { const r = await bp(`/v1/schemas/${ds}`, {method: 'POST', body: readFileSync(repo(`contracts/barkpark/${type}.json`))}); if (!r.ok) throw new Error(`schema ${type} ${r.status}`) }
const docs = readFileSync(repo('fixtures/notes.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const r = await bp(`/v1/data/mutate/${ds}`, {method: 'POST', body: JSON.stringify({mutations: docs.flatMap((d) => [{createOrReplace: d}, {publish: {id: d._id, type: d._type}}])})})
console.log(ds, r.status, docs.length)
