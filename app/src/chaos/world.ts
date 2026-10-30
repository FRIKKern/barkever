import {freeze} from './hooks.ts'
import {use} from './fake-db.ts'
import {answer, type Remote} from './fake-remote.ts'
import {barkpark} from './server.ts'
import {partsOf, truth} from './truth.ts'
import {OLD_TITLE, oldCopies, para, show, textOf} from './edits.ts'
import type {Setup, Step} from './plan.ts'
import {ID, writer, type Job, type Writer} from './writer.ts'
import {writing} from './writing.ts'
import {unheld, unsettled, type Failure} from './judge.ts'
import {keeper} from '../sync/cursor.ts'
import type {Conflict} from '../lib/model.ts'
import type {NoteDoc} from '../replica/note.ts'
import type {Decide} from '../replica/settle.ts'
import type {Frame} from '../sync/stream.ts'

const {settle} = await import('../replica/settle.ts')
const {push} = await import('../sync/push.ts')
const {check, refetch} = await import('../sync/check.ts')
const {fromServer} = await import('../replica/note.ts')

const NAMES = ['A', 'B', 'C']
const ROUNDS = 40
const OFFLINE = new Error('chaos: offline')
const EPOCH = Date.parse('2026-10-29T12:00:00.000Z')

const decideFor = (f: Frame): Decide => (known) => (known === f.rev ? 'skip' : known === (f.previousRev ?? undefined) ? 'apply' : 'suspect')

export function world(setup: Setup) {
  let clock = 0
  let at = -1
  let caught: Failure | undefined
  const log: string[] = []
  const t = truth()
  const writers: Writer[] = []
  const fresh: NoteDoc = {_id: ID, _type: 'note', title: 'T0', notebook: {_type: 'reference', _ref: 'nb0'}, tags: [], links: [], body: {blocks: Array.from({length: setup.blocks}, (_, i) => para(`s${i}`, `S${i}`))}}
  const first: NoteDoc = setup.solo ? fresh : {...fresh, conflicts: oldCopies(fresh)}
  const server = barkpark(first, (f) => writers.forEach((w) => w.connected && w.inbox.push({f, replay: false})))
  for (const [part, text] of partsOf(first)) t.wrote({part, text, by: 'seed', step: -1})
  if (!setup.solo) t.wrote({part: 'title', text: OLD_TITLE, by: 'old', step: -1})

  const note = (w: Writer) => w.device.stores.notes.get(ID) as NoteDoc | undefined
  const viewOf = (w: Writer) => ({title: note(w)?.title ?? '', blocks: note(w)?.body?.blocks ?? [], tags: note(w)?.tags ?? [], notebook: note(w)?.notebook?._ref ?? null})
  const say = (w: Writer | string, what: string) => void log.push(`${(at === Infinity ? 'end' : String(at)).padStart(4)} ${typeof w === 'string' ? w : w.id} ${what}`)
  const queue = (w: Writer, job: Job) => void (w.jobs.includes(job) || w.jobs.push(job))

  const keysOf = (n: NoteDoc | undefined) => new Set((n?.conflicts ?? []).map((c) => c._key))

  const as = async (w: Writer, fn: () => unknown) => {
    const had = keysOf(note(w))
    const shared = new Set(server.keys)
    use(w.device)
    answer(remoteOf(w))
    const flow = Promise.resolve()
      .then(fn)
      .catch((e) => e === OFFLINE || (caught ??= {kind: 'crash', step: at, detail: `${w.id}: ${e?.stack ?? e}`}))
    await Promise.race([flow, new Promise<void>((r) => (w.parked = r))])
    const own = (c: Conflict) => server.authors.get(c._key.split('~')[0]) === w.id || (c.clash.length > 0 && c.clash.every((p) => t.author(p, textOf(c, p)) === w.id))
    const echo = (note(w)?.conflicts ?? []).find((c) => !had.has(c._key) && !shared.has(c._key) && own(c))
    if (echo) caught ??= {kind: 'echo', step: at, detail: `${w.id} made copy ${echo._key} by ${echo.by} of its own text: ${show(note(w))}`}
  }

  function remoteOf(w: Writer): Remote {
    const call = <T>(now: () => T, label: (v: T) => string) =>
      new Promise<T>((resolve, reject) => {
        if (!w.connected) return reject(OFFLINE)
        if (w.call) throw new Error('chaos: two calls in flight')
        const value = now()
        w.call = {label: label(value), go: () => resolve(value), fail: () => reject(OFFLINE)}
        say(w, `sends ${w.call.label}`)
        w.parked?.()
      })
    return {
      mutate: (ms) => call(() => server.mutate(ms, w.id), (res) => `push → ${res.status}${res.docs[0] ? ` ${res.docs[0]._rev}` : ''}`),
      docs: (_type, ids) => call(() => (ids.includes(ID) ? [server.doc as never] : []), () => `refetch → ${server.doc._rev}`),
      manifest: () => call(() => ({note: [{id: ID, rev: server.doc._rev!}], notebook: []}), () => `manifest → ${server.doc._rev}`),
    }
  }

  const persist = (w: Writer) => {
    if (!w.cursor) return
    const kept = w.cursor.keep()
    w.device.stores.meta.set('cursor', kept.cursor)
    w.device.stores.meta.set('seen', kept.seen)
  }

  const caughtUp = (w: Writer) => {
    if (!w.catching || w.inbox.some((x) => x.replay)) return
    w.catching = false
    queue(w, 'catchup')
  }

  function connect(w: Writer) {
    const meta = w.device.stores.meta
    const since = (meta.get('cursor') as number | null | undefined) ?? null
    w.cursor = keeper({cursor: since, seen: (meta.get('seen') as number[] | undefined) ?? []}, () => clock)
    w.connected = true
    w.session++
    w.inbox = since === null ? [] : server.events.filter((f) => f.eventId > since).map((f) => ({f, replay: true}))
    w.catching = true
    queue(w, 'push')
    caughtUp(w)
  }

  async function disconnect(w: Writer) {
    w.cursor?.stop()
    persist(w)
    w.connected = false
    w.catching = false
    w.inbox = []
    w.jobs = []
    w.session++
    const job = w.running
    w.running = undefined
    const call = w.call
    w.call = undefined
    if (call) await as(w, () => (call.fail(), job))
  }

  const jobs: Record<Job, (w: Writer) => Promise<void>> = {
    push: async (w) => {
      const wait = await push()
      w.retry = wait === undefined ? undefined : clock + wait
    },
    refetch: () => refetch(new Map([[ID, 'note']])),
    catchup: async (w) => {
      await check()
      await jobs.push(w)
    },
  }

  async function startJob(w: Writer) {
    if (w.retry !== undefined && w.retry <= clock) {
      w.retry = undefined
      queue(w, 'push')
    }
    if (!w.connected || w.running || w.call || !w.jobs.length) return false
    const job = w.jobs.shift()!
    const session = w.session
    say(w, `runs ${job}`)
    await as(w, () => (w.running = jobs[job](w).finally(() => w.session === session && (w.running = undefined))))
    return true
  }

  async function reply(w: Writer) {
    const call = w.call
    if (!call) return false
    w.call = undefined
    say(w, `gets reply: ${call.label}`)
    await as(w, () => (call.go(), w.running))
    return true
  }

  async function frame(w: Writer, a: number, b: number) {
    if (!w.connected || !w.inbox.length) return false
    const i = w.inbox[0].replay ? 0 : Math.floor(a * Math.min(3, w.inbox.length))
    const [{f, replay}] = w.inbox.splice(i, 1)
    if (b < 0.12) w.inbox.push({f, replay: false})
    else if (b < 0.2 && f.eventId > 1) w.inbox.push({f: server.events[Math.floor(((b - 0.12) / 0.08) * (f.eventId - 1))], replay: false})
    say(w, `gets frame ${f.previousRev}→${f.rev}${replay ? ' (replay)' : ''}${w.cursor!.seen(f.eventId) ? ' (seen)' : ''}`)
    await as(w, async () => {
      if (w.cursor!.seen(f.eventId)) return
      const verdict = await settle('note', ID, fromServer(f.result) as NoteDoc, decideFor(f), !w.catching)
      if (verdict === 'suspect' && !w.catching) queue(w, 'refetch')
      w.cursor!.saw(f.eventId)
      persist(w)
    })
    caughtUp(w)
    return true
  }

  const {type, organize, keepCopy, raw} = writing({t, server, step: () => at, say, as, queue, note, viewOf})

  async function act(s: Step): Promise<boolean> {
    clock += Math.floor(s.a * 2000)
    if (s.k === 'raw') return (raw(s.a, s.b), true)
    const w = writers[s.w]
    switch (s.k) {
      case 'type':
      case 'revert':
      case 'add':
      case 'delete':
        return type(w, s.a, s.b, s.k)
      case 'organize':
        return organize(w, s.a, s.b)
      case 'keep':
        return keepCopy(w, s.a)
      case 'render':
        say(w, 'shows the replica (canvas blurred)')
        w.view = viewOf(w)
        return true
      case 'net':
        w.online = !w.online
        say(w, w.online ? 'comes online' : 'goes offline')
        if (w.online) connect(w)
        else await disconnect(w)
        return true
      case 'reload':
        say(w, 'reloads')
        await disconnect(w)
        w.view = viewOf(w)
        if (w.online) connect(w)
        return true
      case 'frame':
        return frame(w, s.a, s.b)
      case 'job':
        return startJob(w)
      case 'reply':
        return reply(w)
      case 'wait':
        clock += 61_000
        writers.forEach(persist)
        say(w, 'waits 61 s')
        return true
    }
  }

  const inspect = () => caught ?? unheld(t, [server.doc, ...writers.map(note)], at)

  async function drain() {
    let moved = false
    for (const w of writers)
      for (;;) {
        if (!(await reply(w)) && !(await frame(w, 0, 1)) && !(await startJob(w))) break
        moved = true
        if (caught) return false
      }
    return moved
  }

  async function finish(): Promise<Failure | undefined> {
    at = Infinity
    for (const w of writers) {
      if (!w.online) {
        w.online = true
        say(w, 'comes online')
        connect(w)
      }
      w.view = viewOf(w)
    }
    let checkedAt: string | undefined
    for (let round = 0; round < ROUNDS; round++) {
      const moved = await drain()
      clock += 6 * 60_000
      writers.forEach(persist)
      const bad = inspect()
      if (bad) return bad
      if (moved) continue
      const rev = server.doc._rev
      if (checkedAt === rev && writers.every((w) => !w.device.stores.outbox.size)) return settled()
      checkedAt = rev
      writers.forEach((w) => queue(w, 'catchup'))
    }
    return {kind: 'stuck', step: at, detail: `not settled after ${ROUNDS} rounds: ${writers.map((w) => `${w.id} outbox ${w.device.stores.outbox.size}`).join(', ')}`}
  }

  const settled = () => unsettled(t, server.doc, writers.map((w) => [w.id, note(w)]), !!setup.solo, at)

  for (const id of NAMES.slice(0, setup.writers)) {
    const w = writer(id)
    w.device.stores.notes.set(ID, {...server.doc, _gen: 0})
    w.device.stores.rows.set(ID, {id: ID, rev: 'r0'})
    w.device.stores.meta.set('cursor', 0)
    w.view = viewOf(w)
    connect(w)
    writers.push(w)
  }

  return {
    log,
    get server() {
      return server.doc
    },
    async run(steps: Step[]): Promise<Failure | undefined> {
      const thaw = freeze(() => EPOCH + clock)
      try {
        for (const [i, s] of steps.entries()) {
          at = i
          if (!(await act(s))) continue
          const bad = inspect()
          if (bad) return bad
        }
        return await finish()
      } finally {
        thaw()
      }
    },
  }
}
