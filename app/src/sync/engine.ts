import {onChange} from '../replica/bus'
import {db, replicaKey} from '../replica/db'
import type {DocType} from '../replica/note'
import {check, refetch} from './check'
import {openFeed} from './feed'
import {push} from './push'
import {openStream} from './stream'

const CHECK_EVERY_MS = 10 * 60_000
const RETRY_MS = 2000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const online = () => (navigator.onLine ? Promise.resolve() : new Promise((r) => window.addEventListener('online', r, {once: true})))

let started = false

export function startSync() {
  if (started || typeof navigator === 'undefined' || !navigator.locks) return
  started = true
  void db().then(() => hold(`${replicaKey()}-sync`))
}

async function hold(name: string): Promise<never> {
  for (;;) {
    const lost = new AbortController()
    await navigator.locks
      .request(name, {ifAvailable: true}, (lock) => lock && forever(lost.signal))
      .catch((e) => console.warn('sync lock lost', e))
      .finally(() => lost.abort())
    await sleep(RETRY_MS)
  }
}

async function forever(lost: AbortSignal): Promise<void> {
  for (;;) {
    await online()
    if (lost.aborted) return
    await session(lost).catch((e) => console.warn('sync session', e))
    await sleep(RETRY_MS)
  }
}

function lane(alive: () => boolean) {
  let chain = Promise.resolve()
  const queued = new Set<string>()
  const run = (key: string, job: () => Promise<void>, delay = 0) => {
    if (queued.has(key)) return
    queued.add(key)
    setTimeout(() => {
      chain = chain
        .then(() => {
          queued.delete(key)
          return alive() ? job() : undefined
        })
        .catch((e) => {
          console.warn(`sync ${key}`, e)
          if (alive()) run(key, job, RETRY_MS)
        })
    }, delay)
  }
  return run
}

async function session(lost: AbortSignal) {
  let alive = true
  let answered = false
  let live = false
  let retry: ReturnType<typeof setTimeout> | undefined
  const suspects = new Map<string, DocType>()
  const run = lane(() => alive)
  const refetchSuspects = async () => {
    const all = new Map(suspects)
    suspects.clear()
    await refetch(all)
  }
  const pushing = async () => {
    const wait = await push()
    clearTimeout(retry)
    if (wait !== undefined && alive) retry = setTimeout(() => run('push', pushing), wait)
  }
  const feed = await openFeed((type, id) => {
    suspects.set(id, type)
    if (live) run('refetch', refetchSuspects, 500)
  })
  const stream = openStream(feed.since, feed.onFrame)
  const stop = () => stream.close()
  window.addEventListener('offline', stop)
  lost.addEventListener('abort', stop)
  const offLocal = onChange((c) => c.kind === 'local' && answered && run('push', pushing))
  const timer = setInterval(() => run('check', () => check({onlyIfCountsDiffer: true})), CHECK_EVERY_MS)
  try {
    if (!(await stream.opened)) return
    answered = true
    run('push', pushing)
    if (!(await stream.caughtUp)) return
    await feed.drained()
    feed.caughtUp()
    suspects.clear()
    live = true
    run('catch-up', async () => {
      await check()
      await pushing()
    })
    await stream.closed
  } finally {
    feed.close()
    alive = false
    clearTimeout(retry)
    window.removeEventListener('offline', stop)
    lost.removeEventListener('abort', stop)
    offLocal()
    clearInterval(timer)
    stream.close()
  }
}
