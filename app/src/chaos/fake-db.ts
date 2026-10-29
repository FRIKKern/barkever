import {frozen} from './frozen.ts'
import type {LocalNote} from '../replica/db.ts'
import type {NoteDoc} from '../replica/note.ts'

const KEYS: Record<string, string | undefined> = {notes: '_id', notebooks: '_id', rows: 'id', outbox: 'id', meta: undefined}

export type Device = {id: string; stores: Record<string, Map<string, unknown>>}

export const newDevice = (id: string): Device => ({id, stores: Object.fromEntries(Object.keys(KEYS).map((k) => [k, new Map()]))})

let current: Device | undefined

export const use = (d: Device) => void (current = d)

const device = () => {
  if (!current) throw new Error('chaos: no device in use')
  return current
}

const memory = new Map<string, string>()
globalThis.localStorage ??= {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
} as Storage

function storeOf(d: Device, name: string) {
  const m = d.stores[name]
  return {
    get: async (k: string) => m.get(k),
    getAll: async () => [...m.values()],
    put: async (v: Record<string, unknown>, k?: string) => void m.set(k ?? String(v[KEYS[name]!]), frozen(v)),
    delete: async (k: string) => void m.delete(k),
  }
}

function open(d: Device) {
  const tx = (names: string | readonly string[]) => ({
    objectStore: (n: string) => storeOf(d, n),
    store: storeOf(d, typeof names === 'string' ? names : names[0]),
    done: Promise.resolve(),
  })
  return {
    transaction: tx,
    get: (n: string, k: string) => storeOf(d, n).get(k),
    getAllKeys: async (n: string) => [...d.stores[n].keys()],
    getAll: (n: string) => storeOf(d, n).getAll(),
    put: (n: string, v: never, k?: string) => storeOf(d, n).put(v, k),
    delete: (n: string, k: string) => storeOf(d, n).delete(k),
    close: () => {},
  }
}

export const db = async () => open(device())

export const deviceId = () => device().id

export const replicaKey = () => `chaos-${device().id}`

export const nameReplica = () => {}

export const forgetReplica = async () => Object.values(device().stores).forEach((m) => m.clear())

export const NOTE_STORES = ['notes', 'rows', 'outbox'] as const

export function stored(note: LocalNote): NoteDoc {
  const {_gen, ...rest} = note
  return rest
}
