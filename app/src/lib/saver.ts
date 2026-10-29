import {useSyncExternalStore} from 'react'
import {notifyManager, useQuery, type QueryClient} from '@tanstack/react-query'
import {pendingQuery} from './library'
import type {Reach} from './online'

export type SaveStatus = 'saved' | 'saving' | 'offline' | 'unreachable'

const dirty = new Set<string>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function markDirty(id: string) {
  if (dirty.has(id)) return
  dirty.add(id)
  emit()
}

function markClean(id: string) {
  if (dirty.delete(id)) emit()
}

export const markSaved = (qc: QueryClient, id: string) => void qc.refetchQueries({queryKey: pendingQuery.queryKey}).finally(() => notifyManager.schedule(() => markClean(id)))

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

export function useSaveStatus(id: string, reach: Reach): SaveStatus {
  const typing = useSyncExternalStore(subscribe, () => dirty.has(id), () => false)
  const {data: pending} = useQuery(pendingQuery)
  if (!typing && !pending?.has(id)) return 'saved'
  return reach === 'online' ? 'saving' : reach
}
