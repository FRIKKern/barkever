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

const THROWAWAY = /^(e2e|j10|probe-p3[gh])-\d{14}(-\d+)?$/
export const throwaway = (dataset: string) => THROWAWAY.test(dataset)
export const ownRun = (dataset: string) => throwaway(dataset) && dataset.endsWith(`-${process.pid}`)

export async function drop(dataset: string): Promise<string> {
  if (!throwaway(dataset)) throw new Error(`only throwaway run datasets get deleted, not "${dataset}"`)
  const res = await bp(`/v1/datasets/${dataset}`, {method: 'DELETE'})
  if (res.status === 404) return `${dataset} was already gone`
  if (!res.ok) return `kept ${dataset}: Barkpark ${res.status} ${(await res.text()).slice(0, 400)}`
  const {documents} = (await res.json()) as {documents: number}
  return `dropped ${dataset} (${documents} documents)`
}
