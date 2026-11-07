import {useSyncExternalStore} from 'react'
import {db} from '../replica/db'
import {onChange} from '../replica/bus'
import {jotted} from '../replica/journal'
import type {Reach} from './online'

type SaveStatus = 'saved' | 'saving' | 'offline' | 'unreachable' | 'unchecked' | 'unsaved'
export type Field = 'title' | 'body'
type Stage = 'typed' | 'queued' | 'saved' | 'unchecked' | 'unsaved'

const typed = new Map<string, Map<Field, number>>()
const covered = new Map<string, Map<Field, number>>()
const unwritten = new Map<string, Set<Field | undefined>>()
let queued = new Set<string>()
let known = false
let failed = false
let latest = 0
let clock = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function markDirty(id: string, field: Field) {
  const fresh = !typed.has(id)
  typed.set(id, (typed.get(id) ?? new Map()).set(field, ++clock))
  if (fresh) emit()
}

export const savePoint = (id: string, field: Field) => typed.get(id)?.get(field)

function clean() {
  for (const [id, fields] of covered) {
    const now = typed.get(id)
    for (const [field, upTo] of fields) if ((now?.get(field) ?? Infinity) <= upTo) now!.delete(field)
    if (now?.size === 0) typed.delete(id)
  }
  covered.clear()
}

function look() {
  const n = (latest = ++clock)
  return db()
    .then((d) => d.getAllKeys('outbox'))
    .then(
      (keys) => {
        if (n !== latest) return
        clean()
        queued = new Set(keys)
        known = true
        failed = false
        emit()
      },
      (e: unknown) => {
        if (n !== latest) return
        failed = true
        console.warn('save status: the outbox could not be read', e)
        emit()
      },
    )
}

export function markSaved(id: string, field: Field, upTo: number | undefined) {
  const parts = unwritten.get(id)
  parts?.delete(field)
  parts?.delete(undefined)
  if (parts?.size === 0) unwritten.delete(id)
  if (upTo !== undefined) {
    const fields = covered.get(id) ?? new Map<Field, number>()
    covered.set(id, fields.set(field, Math.max(fields.get(field) ?? -1, upTo)))
  }
  void look()
}

export const writeFailed = (id: string, field?: Field) => (e: unknown) => {
  unwritten.set(id, (unwritten.get(id) ?? new Set()).add(field))
  console.warn('save status: a write failed', e)
  emit()
}

export const stage = (id: string): Stage => (unwritten.has(id) ? 'unsaved' : failed ? 'unchecked' : typed.has(id) ? 'typed' : !known || queued.has(id) ? 'queued' : 'saved')

export const unsynced = () => (known ? new Set([...typed.keys(), ...queued, ...unwritten.keys()]).size : null)

export const unsyncedNow = (): Promise<number | null> =>
  db()
    .then((d) => d.getAllKeys('outbox'))
    .then(
      (keys) => new Set([...typed.keys(), ...unwritten.keys(), ...jotted().map(([id]) => id), ...keys]).size,
      () => null,
    )

onChange(() => void look())
if (typeof window !== 'undefined') void look()

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export function useSaveStatus(id: string, reach: Reach): SaveStatus {
  const now = useSyncExternalStore(subscribe, () => stage(id), (): Stage => 'saved')
  if (now === 'saved' || now === 'unchecked' || now === 'unsaved') return now
  return now === 'typed' || reach === 'online' ? 'saving' : reach
}

export const useUnsynced = () => useSyncExternalStore(subscribe, unsynced, () => null)
