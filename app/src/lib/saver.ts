import {useSyncExternalStore} from 'react'
import {db} from '../replica/db'
import {onChange} from '../replica/bus'
import type {Reach} from './online'

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'unreachable' | 'unchecked'

const typed = new Map<string, number>()
const covered = new Map<string, number>()
let queued = new Set<string>()
let known = false
let failed = false
let latest = 0
let clock = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function markDirty(id: string) {
  const fresh = !typed.has(id)
  typed.set(id, ++clock)
  if (fresh) emit()
}

export const savePoint = (id: string) => typed.get(id)

function look() {
  const n = (latest = ++clock)
  return db()
    .then((d) => d.getAllKeys('outbox'))
    .then(
      (keys) => {
        if (n !== latest) return
        for (const [id, upTo] of covered) if ((typed.get(id) ?? Infinity) <= upTo) typed.delete(id)
        covered.clear()
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

export function markSaved(id: string, upTo: number | undefined) {
  if (upTo !== undefined) covered.set(id, Math.max(covered.get(id) ?? -1, upTo))
  void look()
}

export const stage = (id: string) => (failed ? 'unchecked' : typed.has(id) || !known || queued.has(id) ? 'unsaved' : 'saved')

onChange(() => void look())
if (typeof window !== 'undefined') void look()

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export function useSaveStatus(id: string, reach: Reach): SaveStatus {
  const now = useSyncExternalStore(subscribe, () => stage(id), () => 'saved' as const)
  if (now !== 'unsaved') return now
  return reach === 'online' ? 'saving' : reach
}
