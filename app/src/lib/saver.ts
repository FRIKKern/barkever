import {useSyncExternalStore} from 'react'
import {useQuery} from '@tanstack/react-query'
import {pendingQuery} from './library'

export type SaveStatus = 'saved' | 'saving' | 'here'

const dirty = new Set<string>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function markDirty(id: string) {
  if (dirty.has(id)) return
  dirty.add(id)
  emit()
}

export function markClean(id: string) {
  if (dirty.delete(id)) emit()
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

export function useSaveStatus(id: string, online: boolean): SaveStatus {
  const typing = useSyncExternalStore(subscribe, () => dirty.has(id), () => false)
  const {data: pending} = useQuery(pendingQuery)
  if (!typing && !pending?.has(id)) return 'saved'
  return online ? 'saving' : 'here'
}
