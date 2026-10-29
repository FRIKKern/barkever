import {useSyncExternalStore} from 'react'

export type Reach = 'online' | 'offline' | 'unreachable'

let answered = true
const listeners = new Set<() => void>()

export function reached(ok: boolean) {
  if (ok === answered) return
  answered = ok
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  window.addEventListener('online', l)
  window.addEventListener('offline', l)
  listeners.add(l)
  return () => {
    window.removeEventListener('online', l)
    window.removeEventListener('offline', l)
    listeners.delete(l)
  }
}

const now = (): Reach => (!navigator.onLine ? 'offline' : answered ? 'online' : 'unreachable')

export const useReach = () => useSyncExternalStore(subscribe, now, (): Reach => 'online')
