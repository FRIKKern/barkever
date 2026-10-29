import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {cli} from './account.ts'
import {bulkNotes} from './bulk.ts'

const SEED = fileURLToPath(new URL('../../scripts/seed-fixtures.mjs', import.meta.url))
const FIXTURE_NOTES = 50
const BATCH = 100

const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14)

export const probeName = (env: string | undefined, fallback: string) => {
  const name = env || fallback
  if (!/^probe-p3g-[\w-]+$/.test(name)) throw new Error(`P3 find/organize only writes to a probe-p3g-* dataset, not "${name}"`)
  return name
}

export const ORGANIZE = probeName(process.env.P3G_DATASET, `probe-p3g-${stamp()}`)
export const FIND = probeName(process.env.P3G_FIND_DATASET, 'probe-p3g-5k-20261029')
export const FIND_NOTES = 5000

function bp(path: string, init: RequestInit = {}): Promise<Response> {
  const {server, token} = cli()
  return fetch(`${server}/w/barkever/p/default${path}`, {...init, headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'}})
}

async function count(dataset: string): Promise<number> {
  const res = await bp(`/v1/data/query/${dataset}/note?perspective=drafts&limit=1&fields=_none&count=true`)
  if (res.status === 404) return 0
  if (!res.ok) throw new Error(`Barkpark count ${res.status}`)
  return ((await res.json()) as {result: {total?: number}}).result.total ?? 0
}

export async function seedProbe(dataset: string, notes = FIXTURE_NOTES): Promise<void> {
  if ((await count(dataset)) >= notes) return
  execFileSync(process.execPath, [SEED, dataset], {stdio: 'pipe'})
  const bulk = bulkNotes(notes - FIXTURE_NOTES).map(({_updatedAt, ...d}) => d)
  for (let i = 0; i < bulk.length; i += BATCH) {
    const mutations = bulk.slice(i, i + BATCH).flatMap((d) => [{createOrReplace: d}, {publish: {id: d._id, type: 'note'}}])
    const res = await bp(`/v1/data/mutate/${dataset}`, {method: 'POST', body: JSON.stringify({mutations})})
    if (!res.ok) throw new Error(`Barkpark mutate ${res.status}`)
  }
  const have = await count(dataset)
  if (have !== notes) throw new Error(`${dataset} has ${have} notes, wanted ${notes}`)
}

export async function serverNote(dataset: string, id: string): Promise<{notebook?: {_ref: string}; tags?: string[]}> {
  const res = await bp(`/v1/data/query/${dataset}/note?perspective=drafts&limit=2&filter[_id][in]=${id},drafts.${id}`)
  if (!res.ok) throw new Error(`Barkpark query ${res.status}`)
  const docs = ((await res.json()) as {result: {documents: {_id: string; notebook?: {_ref: string}; tags?: string[]}[]}}).result.documents
  return docs.find((d) => d._id.startsWith('drafts.')) ?? docs[0] ?? {}
}
