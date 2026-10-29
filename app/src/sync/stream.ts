import {reached} from '../lib/online'
import type {ServerDoc} from '../server/sync'

export type Frame = {eventId: number; mutation: string; type: string; documentId: string; rev: string; previousRev: string | null; result: ServerDoc}
export type Stream = {opened: Promise<boolean>; caughtUp: Promise<boolean>; closed: Promise<void>; close: () => void}

const QUIET_MS = 1000

export function openStream(since: number | null, onFrame: (f: Frame) => void): Stream {
  const es = new EventSource(since === null ? '/api/listen' : `/api/listen?since=${since}`)
  let welcomed = false
  let last = performance.now()
  let finish!: () => void
  let welcome!: (ok: boolean) => void
  const closed = new Promise<void>((r) => (finish = r))
  const opened = new Promise<boolean>((r) => (welcome = r))
  void closed.then(() => welcome(false))
  const close = () => {
    es.close()
    finish()
  }
  es.addEventListener('welcome', () => {
    welcomed = true
    last = performance.now()
    reached(true)
    welcome(true)
  })
  es.addEventListener('mutation', (e) => {
    last = performance.now()
    onFrame(JSON.parse((e as MessageEvent<string>).data))
  })
  es.addEventListener('overloaded', close)
  es.onerror = () => {
    if (!welcomed) reached(false)
    close()
  }
  const caughtUp = new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => {
      clearInterval(tick)
      resolve(ok)
    }
    const tick = setInterval(() => welcomed && (since === null || performance.now() - last >= QUIET_MS) && done(true), 50)
    void closed.then(() => done(false))
  })
  return {opened, caughtUp, closed, close}
}
