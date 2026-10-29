import './hooks.ts'
import {newDevice, use, type Device} from './fake-db.ts'
import {answer, type Remote} from './fake-remote.ts'
import {barkpark} from './server.ts'
import {partsOf, truth} from './truth.ts'
import type {Setup, Step} from './plan.ts'
import {keeper} from '../sync/cursor.ts'
import type {Block, Conflict} from '../lib/model.ts'
import type {NoteDoc} from '../replica/note.ts'
import type {Decide} from '../replica/settle.ts'
import type {Frame} from '../sync/stream.ts'

const {editBody, editTitle} = await import('../replica/local.ts')
const {settle} = await import('../replica/settle.ts')
const {push} = await import('../sync/push.ts')
const {check, refetch} = await import('../sync/check.ts')
const {sameContent} = await import('../replica/merge.ts')
const {fromServer} = await import('../replica/note.ts')

export const ID = 'n1'
const NAMES = ['A', 'B', 'C']
const ROUNDS = 40
const OFFLINE = new Error('chaos: offline')
const EPOCH = Date.parse('2026-10-29T12:00:00.000Z')

export type Failure = {kind: 'lost' | 'echo' | 'diverged' | 'stuck' | 'noisy' | 'crash'; step: number; detail: string}

type Job = 'push' | 'refetch' | 'catchup'
type Call = {label: string; go: () => void; fail: () => void}
type Writer = {
  id: string
  device: Device
  online: boolean
  connected: boolean
  catching: boolean
  session: number
  view: {title: string; blocks: Block[]}
  inbox: {f: Frame; replay: boolean}[]
  cursor?: ReturnType<typeof keeper>
  jobs: Job[]
  running?: Promise<unknown>
  call?: Call
  retry?: number
  parked?: () => void
  typed: number
}

const para = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const textOf = (n: {title?: string; body?: NoteDoc['body']}, part: string) => partsOf(n).find(([p]) => p === part)?.[1] ?? ''
const decideFor = (f: Frame): Decide => (known) => (known === f.rev ? 'skip' : known === (f.previousRev ?? undefined) ? 'apply' : 'suspect')

function edited(old: string, token: string, mode: number, where: number) {
  if (mode < 0.5 || !old) return old ? `${old} ${token}` : token
  if (mode < 0.8) {
    const words = old.split(' ')
    words.splice(Math.floor(where * (words.length + 1)), 0, token)
    return words.join(' ')
  }
  return token
}
const modeName = (mode: number) => (mode < 0.5 ? 'types at the end of' : mode < 0.8 ? 'types in the middle of' : 'types over')

export const show = (n: NoteDoc | null | undefined) => {
  if (!n) return 'none'
  const one = (v: {title?: string; body?: NoteDoc['body']}) => partsOf(v).map(([p, t]) => `${p === 'title' ? '' : `${p.slice(5)}:`}"${t}"`).join(' ')
  return `${one(n)}${(n.conflicts ?? []).map((c: Conflict) => `\n      copy ${c._key} by ${c.by}: ${one(c)} clash ${c.clash.join(',')}`).join('')}`
}

export function world(setup: Setup) {
  let clock = 0
  let at = -1
  let rawTyped = 0
  let caught: Failure | undefined
  const log: string[] = []
  const t = truth()
  const writers: Writer[] = []
  const first: NoteDoc = {_id: ID, _type: 'note', title: 'T0', tags: [], links: [], body: {blocks: Array.from({length: setup.blocks}, (_, i) => para(`s${i}`, `S${i}`))}}
  const server = barkpark(first, (f) => writers.forEach((w) => w.connected && w.inbox.push({f, replay: false})))
  for (const [part, text] of partsOf(first)) t.wrote({part, text, by: 'seed', step: -1})

  const note = (w: Writer) => w.device.stores.notes.get(ID) as NoteDoc | undefined
  const viewOf = (w: Writer) => ({title: note(w)?.title ?? '', blocks: note(w)?.body?.blocks ?? []})
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
    const own = (c: Conflict) => server.authors.get(c._key) === w.id || (c.clash.length > 0 && c.clash.every((p) => t.author(p, textOf(c, p)) === w.id))
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

  async function type(w: Writer, a: number, b: number, k: 'type' | 'add' | 'delete') {
    const blocks = w.view.blocks
    const token = `${w.id}${++w.typed}`
    let after = blocks
    if (k === 'add') {
      const id = `${w.id.toLowerCase()}${w.typed}`
      after = [...blocks]
      after.splice(Math.floor(a * (blocks.length + 1)), 0, para(id, token))
      t.wrote({part: `body:${id}`, text: token, by: w.id, step: at})
      say(w, `adds block ${id} "${token}"`)
    } else {
      const parts = ['title', ...blocks.map((x) => `body:${x.id}`)]
      const part = k === 'delete' ? parts[1 + Math.floor(a * (parts.length - 1))] : parts[Math.floor(a * parts.length)]
      if (!part) return false
      const old = textOf({title: w.view.title, body: {blocks}}, part)
      t.editedFrom(part, old)
      if (k === 'delete') {
        after = blocks.filter((x) => `body:${x.id}` !== part)
        say(w, `deletes block ${part.slice(5)} "${old}"`)
      } else {
        const next = edited(old, token, b, (a * 7919) % 1)
        t.wrote({part, text: next, by: w.id, step: at})
        say(w, `${modeName(b)} ${part === 'title' ? 'the title' : `block ${part.slice(5)}`}: "${old}" → "${next}"`)
        if (part === 'title') {
          w.view.title = next
          await as(w, () => editTitle(ID, old, next))
          if (w.connected) queue(w, 'push')
          return true
        }
        after = blocks.map((x) => (`body:${x.id}` === part ? para(x.id, next) : x))
      }
    }
    await as(w, async () => (w.view.blocks = (await editBody(ID, blocks, after)) ?? after))
    if (w.connected) queue(w, 'push')
    return true
  }

  function raw(a: number, b: number) {
    const doc = server.doc
    const parts = partsOf(doc)
    const i = Math.floor(a * (parts.length + 1))
    const token = `R${++rawTyped}`
    if (i === parts.length) {
      const id = `r${rawTyped}`
      t.wrote({part: `body:${id}`, text: token, by: 'raw', step: at})
      say('raw', `adds block ${id} "${token}" on the server`)
      server.raw((d) => ({...d, body: {blocks: [...(d.body?.blocks ?? []), para(id, token)]}}))
      return
    }
    const [part, old] = parts[i]
    const next = edited(old, token, b, (a * 7919) % 1)
    t.editedFrom(part, old)
    t.wrote({part, text: next, by: 'raw', step: at})
    say('raw', `${modeName(b)} ${part === 'title' ? 'the title' : `block ${part.slice(5)}`} on the server: "${old}" → "${next}"`)
    server.raw((d) => (part === 'title' ? {...d, title: next} : {...d, body: {blocks: (d.body?.blocks ?? []).map((x) => (`body:${x.id}` === part ? para(x.id, next) : x))}}))
  }

  async function act(s: Step): Promise<boolean> {
    clock += Math.floor(s.a * 2000)
    if (s.k === 'raw') return (raw(s.a, s.b), true)
    const w = writers[s.w]
    switch (s.k) {
      case 'type':
      case 'add':
      case 'delete':
        return type(w, s.a, s.b, s.k)
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

  function inspect(): Failure | undefined {
    if (caught) return caught
    const lost = t.lost([server.doc, ...writers.map(note)])
    if (lost.length) return {kind: 'lost', step: at, detail: lost.map((v) => `"${v.text}" (${v.part}, written by ${v.by} at step ${v.step}) is on no device and not on the server`).join('\n  ')}
  }

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

  function settled(): Failure | undefined {
    const doc = server.doc
    const off = writers.filter((w) => !note(w) || !sameContent(note(w)!, doc))
    if (off.length) return {kind: 'diverged', step: at, detail: `server: ${show(doc)}\n  ${off.map((w) => `${w.id}: ${show(note(w))}`).join('\n  ')}`}
    const lost = t.lost([doc])
    if (lost.length) return {kind: 'lost', step: at, detail: lost.map((v) => `"${v.text}" (${v.part}, by ${v.by} at step ${v.step}) is not on the settled note`).join('\n  ')}
    if (setup.solo && doc.conflicts?.length) return {kind: 'noisy', step: at, detail: `one writer typing alone made ${doc.conflicts.length} copies: ${show(doc)}`}
  }

  for (const id of NAMES.slice(0, setup.writers)) {
    const w: Writer = {id, device: newDevice(id), online: true, connected: false, catching: false, session: 0, view: {title: '', blocks: []}, inbox: [], jobs: [], typed: 0}
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
      const now = Date.now
      Date.now = () => EPOCH + clock
      try {
        for (const [i, s] of steps.entries()) {
          at = i
          if (!(await act(s))) continue
          const bad = inspect()
          if (bad) return bad
        }
        return await finish()
      } finally {
        Date.now = now
      }
    },
  }
}
