import {useSyncExternalStore} from 'react'

export type SaveStatus = 'saved' | 'saving' | 'failed'
type Slot = {rev: string; tail: Promise<void>; pending: number; failed: boolean; dirty: boolean}

const slots = new Map<string, Slot>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function slot(id: string, rev = ''): Slot {
  let s = slots.get(id)
  if (!s) slots.set(id, (s = {rev, tail: Promise.resolve(), pending: 0, failed: false, dirty: false}))
  return s
}

export const knowRev = (id: string, rev: string) => void slot(id, rev)

export function markDirty(id: string) {
  const s = slot(id)
  if (s.dirty) return
  s.dirty = true
  emit()
}

export function enqueue(id: string, job: (rev: string) => Promise<string | null>): Promise<void> {
  const s = slot(id)
  s.dirty = false
  s.pending++
  emit()
  s.tail = s.tail
    .then(() => job(s.rev))
    .then(
      (rev) => {
        s.failed = !rev
        if (rev) s.rev = rev
      },
      () => void (s.failed = true),
    )
    .finally(() => {
      s.pending--
      emit()
    })
  return s.tail
}

export function statusOf(id: string): SaveStatus {
  const s = slots.get(id)
  return !s ? 'saved' : s.pending || s.dirty ? 'saving' : s.failed ? 'failed' : 'saved'
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

export const useSaveStatus = (id: string) => useSyncExternalStore(subscribe, () => statusOf(id), (): SaveStatus => 'saved')
