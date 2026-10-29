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
  void db().then(() => navigator.locks.request(`${replicaKey()}-sync`, forever))
}

async function forever(): Promise<never> {
  for (;;) {
    await online()
    await session().catch((e) => console.warn('sync session', e))
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

async function session() {
  let alive = true
  let live = false
  const suspects = new Map<string, DocType>()
  const run = lane(() => alive)
  const refetchSuspects = async () => {
    const all = new Map(suspects)
    suspects.clear()
    await refetch(all)
  }
  const feed = await openFeed((type, id) => {
    suspects.set(id, type)
    if (live) run('refetch', refetchSuspects, 500)
  })
  const stream = openStream(feed.since, feed.onFrame)
  const stop = () => stream.close()
  window.addEventListener('offline', stop)
  const offLocal = onChange((c) => c.kind === 'local' && live && run('push', push, 200))
  const timer = setInterval(() => run('check', () => check({onlyIfCountsDiffer: true})), CHECK_EVERY_MS)
  try {
    if (!(await stream.caughtUp)) return
    await feed.drained()
    suspects.clear()
    live = true
    run('catch-up', async () => {
      await check()
      await push()
    })
    await stream.closed
  } finally {
    alive = false
    window.removeEventListener('offline', stop)
    offLocal()
    clearInterval(timer)
    stream.close()
  }
}
