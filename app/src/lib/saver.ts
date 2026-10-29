import {useEffect, useSyncExternalStore} from 'react'
import {db} from '../replica/db'
import {onChange} from '../replica/bus'
import type {Reach} from './online'

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'unreachable'

const typed = new Map<string, number>()
const covered = new Map<string, number>()
const queued = new Set<string>()
const known = new Set<string>()
const reads = new Map<string, number>()
let clock = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function markDirty(id: string) {
  const fresh = !typed.has(id)
  typed.set(id, ++clock)
  if (fresh) emit()
}

export const savePoint = (id: string) => typed.get(id)

function look(id: string) {
  const n = ++clock
  reads.set(id, n)
  void db()
    .then((d) => d.getKey('outbox', id))
    .then((key) => {
      if (reads.get(id) !== n) return
      if ((typed.get(id) ?? Infinity) <= (covered.get(id) ?? -1)) typed.delete(id)
      covered.delete(id)
      if (key === undefined) queued.delete(id)
      else queued.add(id)
      known.add(id)
      emit()
    })
}

export function markSaved(id: string, upTo: number | undefined) {
  if (upTo !== undefined) covered.set(id, Math.max(covered.get(id) ?? -1, upTo))
  look(id)
}

export const unsaved = (id: string) => typed.has(id) || queued.has(id) || !known.has(id)

onChange(({ids}) => ids.filter((id) => reads.has(id)).forEach(look))

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export function useSaveStatus(id: string, reach: Reach): SaveStatus {
  useEffect(() => look(id), [id])
  const busy = useSyncExternalStore(subscribe, () => unsaved(id), () => false)
  if (!busy) return 'saved'
  return reach === 'online' ? 'saving' : reach
}
