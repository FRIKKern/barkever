import {bp, fixtures, seed} from './seed.ts'

export const HISTORY = process.env.HISTORY_DATASET || 'probe-history-20261029'
export const HISTORY_EVENTS = Number(process.env.HISTORY_EVENTS || 20_000)

const ROUND = 200
const MARK = 'probe-history-done'

if (!/^probe-history-\d+$/.test(HISTORY)) throw new Error(`the history probe only writes to a probe-history-<stamp> dataset, not "${HISTORY}"`)

async function write(mutations: object[]) {
  const res = await bp(`/v1/data/mutate/${HISTORY}`, {method: 'POST', body: JSON.stringify({mutations})})
  if (!res.ok) throw new Error(`Barkpark mutate ${res.status}`)
}

export async function noteText(id: string): Promise<string> {
  const res = await bp(`/v1/data/query/${HISTORY}/note?perspective=drafts&limit=2&filter[_id][in]=${id},drafts.${id}`)
  if (!res.ok) throw new Error(`Barkpark query ${res.status}`)
  const {result} = (await res.json()) as {result: {documents: Record<string, unknown>[]}}
  return JSON.stringify(result.documents)
}

async function done(): Promise<boolean> {
  const res = await bp(`/v1/data/query/${HISTORY}/notebook?perspective=drafts&limit=1&filter[_id][in]=${MARK},drafts.${MARK}`)
  return res.ok && ((await res.json()) as {result: {documents: unknown[]}}).result.documents.length > 0
}

const round = (r: number) =>
  Array.from({length: ROUND / 10}, (_, i) => `probe-${r}-${i}`).flatMap((id) => [
    {createOrReplace: {_id: id, _type: 'note', title: `Probe ${id}`, notebook: {_ref: 'fx-nb-inbox'}, tags: [], links: [], body: {blocks: []}}},
    ...Array.from({length: 8}, (_, n) => ({patch: {id, type: 'note', set: {title: `Probe ${id} edit ${n}`}}})),
    {delete: {id, type: 'note'}},
  ])

export async function ensureHistory(note: string): Promise<void> {
  if (!(await done())) {
    await seed(HISTORY)
    for (let r = 0; r < HISTORY_EVENTS / ROUND; r++) await write(round(r))
    await write([{createOrReplace: {_id: MARK, _type: 'notebook', name: 'History probe'}}])
  }
  await write([{createOrReplace: {...fixtures().find((d) => d._id === 'fx-note-01')!, _id: note}}])
}

export const dropNote = (note: string) => write([{delete: {id: note, type: 'note'}}])
