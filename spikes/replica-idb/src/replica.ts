import {QueryClient} from '@tanstack/react-query'
import {openReplica, saveEdit} from './db'
import {toRow, type Note, type Row} from './data'
import {metrics, push} from './metrics'
import * as index from './search'

export const N = Number(new URLSearchParams(location.search).get('n') ?? 50)

export const qc = new QueryClient({
  defaultOptions: {queries: {staleTime: Infinity, gcTime: Infinity, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, networkMode: 'always'}},
})

const opened = openReplica(N).then((r) => {
  if (r.seededMs !== null) metrics.seedMs = r.seededMs
  return r.db
})
export const db = () => opened

export const rowsQuery = {
  queryKey: ['rows'],
  queryFn: async (): Promise<Row[]> => {
    let t = performance.now()
    const all = await (await db()).getAll('notes')
    metrics.getAllMs = performance.now() - t
    t = performance.now()
    for (const x of all) index.put(x)
    metrics.indexMs = performance.now() - t
    return all.map(toRow).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  },
}
export const noteQuery = (id: string) => ({queryKey: ['note', id], queryFn: async () => (await (await db()).get('notes', id)) ?? null})
export const notebooksQuery = {queryKey: ['notebooks'], queryFn: async () => new Map((await (await db()).getAll('notebooks')).map((nb) => [nb._id, nb.name]))}
export const outboxQuery = {queryKey: ['outbox'], queryFn: async () => (await db()).getAll('outbox')}

export function edit(id: string, fields: Partial<Pick<Note, 'title' | 'body'>>, t0?: number) {
  const prev = qc.getQueryData<Note>(['note', id])
  if (!prev) return
  const next: Note = {...prev, ...fields, _updatedAt: new Date().toISOString()}
  qc.setQueryData(['note', id], next)
  qc.setQueryData<Row[]>(['rows'], (rows) => rows?.map((r) => (r.id === id ? toRow(next) : r)))
  index.put(next)
  void db()
    .then((d) => saveEdit(d, next, prev, fields))
    .then(() => {
      if (t0 !== undefined) push('ksIdb', performance.now() - t0)
      void qc.invalidateQueries({queryKey: ['outbox']})
    })
}

export async function editMany(ids: string[], suffix: string) {
  for (const id of ids) {
    const x = await qc.fetchQuery(noteQuery(id))
    if (x) edit(id, {title: x.title + suffix})
  }
}
