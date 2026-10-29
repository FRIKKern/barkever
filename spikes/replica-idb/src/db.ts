import {openDB, type DBSchema, type IDBPDatabase} from 'idb'
import {notebooks, type Note, type Notebook} from './data'
import {generate} from './generate'

export type OutboxEntry = {
  docId: string
  type: 'note'
  set: Record<string, unknown>
  base: Record<string, unknown>
  baseRev?: string
  v: number
  first: number
  conflict?: Record<string, unknown>
}

interface Replica extends DBSchema {
  notes: {key: string; value: Note}
  notebooks: {key: string; value: Notebook}
  outbox: {key: string; value: OutboxEntry; indexes: {first: number}}
  meta: {key: string; value: unknown}
}

export type DB = IDBPDatabase<Replica>

export async function openReplica(n: number): Promise<{db: DB; seededMs: number | null}> {
  const db = await openDB<Replica>(`barkever-replica-${n}`, 1, {
    upgrade(d) {
      d.createObjectStore('notes', {keyPath: '_id'})
      d.createObjectStore('notebooks', {keyPath: '_id'})
      d.createObjectStore('outbox', {keyPath: 'docId'}).createIndex('first', 'first')
      d.createObjectStore('meta')
    },
  })
  if (await db.get('meta', 'seeded')) return {db, seededMs: null}
  const t0 = performance.now()
  const tx = db.transaction(['notes', 'notebooks', 'meta'], 'readwrite')
  for (const nb of notebooks) void tx.objectStore('notebooks').put(nb)
  for (const x of generate(n)) void tx.objectStore('notes').put(x)
  void tx.objectStore('meta').put(true, 'seeded')
  await tx.done
  return {db, seededMs: performance.now() - t0}
}

const chains = new Map<string, Promise<void>>()
function serial(id: string, go: () => Promise<void>): Promise<void> {
  const next = (chains.get(id) ?? Promise.resolve()).then(go, go)
  chains.set(id, next)
  return next
}

export function saveEdit(db: DB, next: Note, prev: Note, fields: Record<string, unknown>): Promise<void> {
  return serial(next._id, async () => {
    const tx = db.transaction(['notes', 'outbox'], 'readwrite')
    const outbox = tx.objectStore('outbox')
    const stored = await tx.objectStore('notes').get(next._id)
    void tx.objectStore('notes').put({...next, _rev: stored?._rev})
    const e = await outbox.get(next._id)
    const base = {...e?.base}
    for (const f of Object.keys(fields)) if (!(f in base)) base[f] = (prev as Record<string, unknown>)[f]
    void outbox.put({
      docId: next._id, type: 'note', set: {...e?.set, ...fields}, base,
      baseRev: e ? e.baseRev : stored?._rev, v: (e?.v ?? 0) + 1, first: e?.first ?? Date.now(), conflict: e?.conflict,
    })
    await tx.done
  })
}

export function ackEdit(db: DB, sent: OutboxEntry, rev: string): Promise<void> {
  return serial(sent.docId, async () => {
    const tx = db.transaction(['notes', 'outbox'], 'readwrite')
    const note = await tx.objectStore('notes').get(sent.docId)
    if (note) void tx.objectStore('notes').put({...note, _rev: rev})
    const now = await tx.objectStore('outbox').get(sent.docId)
    if (now && now.v === sent.v && !now.conflict) void tx.objectStore('outbox').delete(sent.docId)
    else if (now) void tx.objectStore('outbox').put({...now, baseRev: rev, base: {...now.base, ...sent.set}})
    await tx.done
  })
}

export const putEntry = (db: DB, e: OutboxEntry) => serial(e.docId, async () => void (await db.put('outbox', e)))
