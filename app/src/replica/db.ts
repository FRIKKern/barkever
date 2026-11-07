import {openDB, type DBSchema, type IDBPDatabase} from 'idb'
import type {NoteDoc, NotebookDoc, Row} from './note'

export type LocalNote = NoteDoc & {_gen?: number}
export type Failure = {n: number; retryAt: number; why: string}
export type Entry = {id: string; base: NoteDoc | null; v: number; at: number; delete?: true; sent?: NoteDoc[]; failed?: Failure}

interface Replica extends DBSchema {
  notes: {key: string; value: LocalNote}
  notebooks: {key: string; value: NotebookDoc}
  rows: {key: string; value: Row}
  outbox: {key: string; value: Entry}
  meta: {key: string; value: unknown}
}

type DB = IDBPDatabase<Replica>

let name: string | undefined
let named: (n: string) => void
const naming = new Promise<string>((r) => (named = r))
let opened: Promise<DB> | undefined

export async function replicaName(email: string | null, dataset: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${email ?? ''}\n${dataset}`))
  return `barkever-${[...new Uint8Array(hash).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function nameReplica(n: string) {
  if (name && name !== n) throw new Error('the replica is already open for someone else; reload')
  name = n
  named(n)
}

export function replicaKey(): string {
  if (!name) throw new Error('the replica has no owner yet')
  return name
}

let device: string | undefined

export function deviceId(): string {
  if (device) return device
  const key = `${replicaKey()}-device`
  try {
    device = localStorage.getItem(key) ?? undefined
  } catch {}
  device ??= crypto.randomUUID()
  try {
    localStorage.setItem(key, device)
  } catch {}
  return device
}

export const db = () =>
  (opened ??= naming.then((n) =>
    openDB<Replica>(n, 1, {
      upgrade(d) {
        d.createObjectStore('notes', {keyPath: '_id'})
        d.createObjectStore('notebooks', {keyPath: '_id'})
        d.createObjectStore('rows', {keyPath: 'id'})
        d.createObjectStore('outbox', {keyPath: 'id'})
        d.createObjectStore('meta')
      },
      blocking(_v, _n, e) {
        ;(e.target as IDBDatabase).close()
      },
    }),
  ))

export async function forgetReplica(): Promise<void> {
  if (!name) return
  if (opened) await opened.then((d) => d.close(), () => undefined)
  await new Promise<void>((done) => {
    const r = indexedDB.deleteDatabase(name!)
    r.onsuccess = r.onerror = r.onblocked = () => done()
  })
}

export const NOTE_STORES = ['notes', 'rows', 'outbox'] as const

export function stored(note: LocalNote): NoteDoc {
  const {_gen, ...rest} = note
  return rest
}
