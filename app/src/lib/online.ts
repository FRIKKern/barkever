import {useSyncExternalStore} from 'react'

export type Reach = 'online' | 'offline' | 'unreachable'

export const ANSWERED = 'barkpark-answered'

let answered = true
let answers = 0
const listeners = new Set<() => void>()
let tabs: BroadcastChannel | undefined

function hear(ok: boolean) {
  if (ok !== answered) {
    answered = ok
    listeners.forEach((l) => l())
  }
  if (!ok) return
  answers++
  dispatchEvent(new Event(ANSWERED))
}

function otherTabs() {
  if (!tabs) {
    tabs = new BroadcastChannel('barkever-reach')
    tabs.onmessage = (e: MessageEvent<unknown>) => typeof e.data === 'boolean' && hear(e.data)
  }
  return tabs
}

export function reached(ok: boolean) {
  hear(ok)
  otherTabs().postMessage(ok)
}

export const answersHeard = () => (otherTabs(), answers)

const subscribe = (l: () => void) => {
  otherTabs()
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
