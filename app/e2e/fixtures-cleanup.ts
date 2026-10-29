import {loadServerEnv} from '../scripts/local-env.ts'
import {barkparkConfig} from '../src/server/config.ts'
import {runName} from './run.ts'

process.env.E2E_DATASET ||= runName('e2e')
export const DATASET = process.env.E2E_DATASET
if (!/^e2e-[\d-]+$/.test(DATASET)) throw new Error(`e2e only writes to an e2e-<stamp> dataset, not "${DATASET}"`)

type Prefs = {shortcuts: string[]; recents: string[]}
const PREF_KEYS = ['shortcuts', 'recents'] as const

export function barkpark(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  loadServerEnv('production', true)
  const cfg = barkparkConfig()
  return fetch(`${cfg.base}${path}`, {...init, headers: {authorization: `Bearer ${token ?? cfg.token()}`, 'content-type': 'application/json', 'x-requested-with': 'barkever'}})
}

export async function deleteNotes(ids: string[]): Promise<void> {
  for (const id of ids) {
    const res = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{delete: {id, type: 'note', force: true}}]})})
    if (!res.ok && res.status !== 404) throw new Error(`cleanup failed: Barkpark ${res.status}`)
  }
}

export async function serverNoteIds(): Promise<string[]> {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=drafts&order=_id:asc&limit=1000`)
  if (!res.ok) throw new Error(`Barkpark query ${res.status}`)
  const {result} = (await res.json()) as {result: {documents: {_id: string}[]}}
  return result.documents.map((d) => d._id.replace(/^drafts\./, ''))
}

export async function prefIds(token: string, key: keyof Prefs): Promise<string[]> {
  const res = await barkpark(`/v1/prefs/${DATASET}/barkever.${key}`, {}, token)
  if (!res.ok) throw new Error(`reading prefs failed: Barkpark ${res.status}`)
  return ((await res.json()) as {value?: {ids?: string[]} | null}).value?.ids ?? []
}

export async function readPrefs(token: string): Promise<Prefs> {
  const [shortcuts, recents] = await Promise.all(PREF_KEYS.map((k) => prefIds(token, k)))
  return {shortcuts, recents}
}

export async function writePrefs(token: string, prefs: Prefs): Promise<void> {
  for (const key of PREF_KEYS) {
    const res = await barkpark(`/v1/prefs/${DATASET}/barkever.${key}`, {method: 'PUT', body: JSON.stringify({value: {v: 1, ids: prefs[key]}})}, token)
    if (!res.ok) throw new Error(`restoring prefs failed: Barkpark ${res.status}`)
  }
}
