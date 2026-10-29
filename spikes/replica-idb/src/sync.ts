import {ackEdit, putEntry, type DB, type OutboxEntry} from './db'
import {db, qc} from './replica'
import type {Note, Notebook} from './data'

export type SyncResult = {sent: number; acked: number; conflicts: number; requests: number; ms: number; error?: string}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)
const strip = ({_rev, _updatedAt, ...doc}: Note | (Notebook & {_updatedAt?: string})) => doc
const rev = (body: {results: {document: {_rev: string}}[]}, j: number) => body.results[j].document._rev

async function post(mutations: unknown[]) {
  const res = await fetch('/bp/mutate', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({mutations})})
  return {status: res.status, body: await res.json().catch(() => ({}))}
}

const mutationFor = (e: OutboxEntry, local: Note) =>
  e.baseRev ? {patch: {id: e.docId, type: e.type, set: e.set, ifRevisionID: e.baseRev}} : {createOrReplace: strip(local)}

async function rebase(d: DB, e: OutboxEntry): Promise<boolean> {
  const res = await fetch(`/bp/doc/${e.type}/${encodeURIComponent(e.docId)}`)
  if (!res.ok) return false
  const theirs = (await res.json()).result as Record<string, unknown> & {_rev: string}
  const set: Record<string, unknown> = {}
  const base: Record<string, unknown> = {}
  const conflict: Record<string, unknown> = {...e.conflict}
  for (const [f, mine] of Object.entries(e.set)) {
    if (same(theirs[f], mine)) continue
    if (same(theirs[f], e.base[f])) (set[f] = mine), (base[f] = theirs[f])
    else conflict[f] = theirs[f]
  }
  if ((await d.get('outbox', e.docId))?.v !== e.v) return true
  await putEntry(d, {...e, set, base, baseRev: theirs._rev, conflict: Object.keys(conflict).length ? conflict : undefined})
  return true
}

async function sendBatch(d: DB, batch: OutboxEntry[], r: SyncResult): Promise<boolean> {
  const locals = await Promise.all(batch.map((e) => d.get('notes', e.docId)))
  r.requests++
  r.sent += batch.length
  const res = await post(batch.map((e, j) => mutationFor(e, locals[j]!)))
  if (res.status === 200) {
    await Promise.all(batch.map((e, j) => ackEdit(d, e, rev(res.body, j))))
    r.acked += batch.length
    return false
  }
  if (res.status !== 412) throw new Error(`mutate ${res.status}: ${JSON.stringify(res.body).slice(0, 200)}`)
  let retry = false
  for (const [j, e] of batch.entries()) {
    r.requests++
    const one = await post([mutationFor(e, locals[j]!)])
    if (one.status === 200) await ackEdit(d, e, rev(one.body, 0)), r.acked++
    else if (one.status === 412) r.conflicts++, (retry = (await rebase(d, e)) || retry)
    else throw new Error(`mutate ${one.status}`)
  }
  return retry
}

async function replay(): Promise<SyncResult> {
  const t0 = performance.now()
  const d = await db()
  const r: SyncResult = {sent: 0, acked: 0, conflicts: 0, requests: 0, ms: 0}
  try {
    for (let round = 0, retry = true; round < 3 && retry; round++) {
      const ready = (await d.getAllFromIndex('outbox', 'first')).filter((e) => Object.keys(e.set).length)
      retry = false
      for (let i = 0; i < ready.length; i += 25) retry = (await sendBatch(d, ready.slice(i, i + 25), r)) || retry
    }
  } catch (err) {
    r.error = (err as Error).message
  }
  r.ms = performance.now() - t0
  return r
}

let syncing: Promise<SyncResult> | null = null
export const sync = () => (syncing ??= replay().finally(() => ((syncing = null), void qc.invalidateQueries({queryKey: ['outbox']}))))

export async function upload(): Promise<SyncResult> {
  const t0 = performance.now()
  const d = await db()
  const r: SyncResult = {sent: 0, acked: 0, conflicts: 0, requests: 0, ms: 0}
  const docs = [...(await d.getAll('notebooks')), ...(await d.getAll('notes'))]
  for (let i = 0; i < docs.length; i += 100) {
    const batch = docs.slice(i, i + 100)
    r.requests++
    r.sent += batch.length
    const res = await post(batch.map((x) => ({createOrReplace: strip(x)})))
    if (res.status !== 200) return {...r, error: `mutate ${res.status}`, ms: performance.now() - t0}
    const tx = d.transaction(['notes', 'notebooks'], 'readwrite')
    batch.forEach((x, j) => void (x._type === 'note' ? tx.objectStore('notes').put({...x, _rev: rev(res.body, j)}) : tx.objectStore('notebooks').put({...x, _rev: rev(res.body, j)})))
    await tx.done
    r.acked += batch.length
  }
  r.ms = performance.now() - t0
  return r
}
