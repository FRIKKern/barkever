import '@tanstack/react-start/server-only'
import {bpFetch, bpJson, dataset} from './barkpark'
import {exactDeletes, isDelete, type Delete} from './deletes'

export type Json = string | number | boolean | null | Json[] | {[key: string]: Json}
export type ServerDoc = {[key: string]: Json} & {_id: string; _type: string; _rev: string}
export type Pushed = {status: number; docs: (ServerDoc | null)[]; error?: string}
export type Manifest = Record<'note' | 'notebook', {id: string; rev: string}[]>

type Page = {result: {documents: ServerDoc[]; hasMore: boolean; total?: number}}
const TYPES = ['note', 'notebook'] as const
const query = (type: string, params: string, perspective = 'drafts') => bpJson<Page>(`/v1/data/query/${dataset()}/${type}?perspective=${perspective}&${params}`)
const bare = (id: string) => id.replace(/^drafts\./, '')

async function rowsOf(deletes: Delete[]): Promise<Map<string, ServerDoc>> {
  const out = new Map<string, ServerDoc>()
  for (const type of new Set(deletes.map((m) => m.delete.type))) {
    const ids = deletes.filter((m) => m.delete.type === type).flatMap((m) => [bare(m.delete.id), `drafts.${bare(m.delete.id)}`])
    for (let i = 0; i < ids.length; i += 200) {
      const docs = (await query(type, `limit=1000&fields=_none&filter[_id][in]=${encodeURIComponent(ids.slice(i, i + 200).join(','))}`, 'raw')).result.documents
      for (const d of docs) out.set(d._id, d)
    }
  }
  return out
}

export async function mutate(mutations: unknown[]): Promise<Pushed> {
  const rows = await rowsOf(mutations.filter(isDelete))
  const sent = mutations.map((m) => (isDelete(m) ? exactDeletes(m, rows) : [m]))
  if (!sent.flat().length) return {status: 200, docs: sent.map(() => null)}
  const res = await bpFetch(`/v1/data/mutate/${dataset()}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({mutations: sent.flat()})})
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return {status: res.status, docs: [], error: body.error?.code ?? `http ${res.status}`}
  const results = body.results as {document: ServerDoc}[]
  const docs: (ServerDoc | null)[] = []
  let at = 0
  for (const ms of sent) {
    docs.push(isDelete(ms[0]) || !ms.length ? null : results[at].document)
    at += ms.length
  }
  return {status: res.status, docs}
}

export async function docsById(type: string, ids: string[]): Promise<ServerDoc[]> {
  const out: ServerDoc[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const want = ids.slice(i, i + 100).flatMap((id) => [id, `drafts.${id}`])
    out.push(...(await query(type, `limit=1000&filter[_id][in]=${encodeURIComponent(want.join(','))}`)).result.documents)
  }
  return out
}

export async function readAll(type: string, fields = ''): Promise<ServerDoc[]> {
  const docs: ServerDoc[] = []
  for (let more = true; more; ) {
    const page = await query(type, `order=_id:asc&limit=1000&offset=${docs.length}${fields && `&fields=${fields}`}`)
    docs.push(...page.result.documents)
    more = page.result.hasMore && page.result.documents.length > 0
  }
  return docs
}

export async function manifest(): Promise<Manifest> {
  const [note, notebook] = await Promise.all(TYPES.map(async (t) => (await readAll(t, '_none')).map((d) => ({id: bare(d._id), rev: d._rev}))))
  return {note, notebook}
}

export async function counts(): Promise<Record<'note' | 'notebook', number>> {
  const [note, notebook] = await Promise.all(TYPES.map(async (t) => (await query(t, 'limit=1&fields=_none&count=true')).result.total ?? 0))
  return {note, notebook}
}

export async function listen(since: string | null, signal: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {accept: 'text/event-stream'}
  if (since && /^\d+$/.test(since)) headers['last-event-id'] = since
  const up = await bpFetch(`/v1/data/listen/${dataset()}`, {headers, signal})
  return new Response(up.body, {status: up.status, headers: {'content-type': 'text/event-stream', 'cache-control': 'no-store, no-transform'}})
}
