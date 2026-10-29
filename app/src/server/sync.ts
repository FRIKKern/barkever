import '@tanstack/react-start/server-only'
import {bpFetch, bpJson, dataset} from './barkpark'

export type Json = string | number | boolean | null | Json[] | {[key: string]: Json}
export type ServerDoc = {[key: string]: Json} & {_id: string; _type: string; _rev: string}
export type Pushed = {status: number; docs: (ServerDoc | null)[]; error?: string}
export type Manifest = Record<'note' | 'notebook', {id: string; rev: string}[]>

type Page = {result: {documents: ServerDoc[]; hasMore: boolean; total?: number}}
const TYPES = ['note', 'notebook'] as const
const query = (type: string, params: string) => bpJson<Page>(`/v1/data/query/${dataset()}/${type}?perspective=drafts&${params}`)
const bare = (id: string) => id.replace(/^drafts\./, '')

export async function mutate(mutations: unknown[]): Promise<Pushed> {
  const res = await bpFetch(`/v1/data/mutate/${dataset()}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({mutations})})
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return {status: res.status, docs: [], error: body.error?.code ?? `http ${res.status}`}
  return {status: res.status, docs: body.results.map((r: {operation: string; document: ServerDoc}) => (r.operation === 'delete' ? null : r.document))}
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
