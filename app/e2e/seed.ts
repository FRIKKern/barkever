import {readFileSync} from 'node:fs'
import {cli} from './account.ts'
import type {Doc} from '../src/replica/note.ts'

const repo = (path: string) => new URL(`../../${path}`, import.meta.url)

export function bp(path: string, init: RequestInit = {}): Promise<Response> {
  const {server, token} = cli()
  return fetch(`${server}/w/barkever/p/default${path}`, {...init, headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'}})
}

export function fixtures(): Doc[] {
  return readFileSync(repo('fixtures/notes.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
}

export async function seed(dataset: string) {
  if (dataset === 'production' || dataset === 'fixtures') throw new Error(`seed only makes throwaway datasets, not "${dataset}"`)
  for (const type of ['notebook', 'note']) {
    const res = await bp(`/v1/schemas/${dataset}`, {method: 'POST', body: readFileSync(repo(`contracts/barkpark/${type}.json`))})
    if (!res.ok) throw new Error(`schema ${type} ${res.status}`)
  }
  const mutations = fixtures().flatMap((d) => [{createOrReplace: d}, {publish: {id: d._id, type: d._type}}])
  const res = await bp(`/v1/data/mutate/${dataset}`, {method: 'POST', body: JSON.stringify({mutations})})
  if (!res.ok) throw new Error(`Barkpark mutate ${res.status}`)
}
