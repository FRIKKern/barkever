import {db, deviceId, stored, type Entry} from '../replica/db'
import {ack, fail} from '../replica/settle'
import {same, sameContent} from '../replica/merge'
import {sign} from '../replica/sign'
import {content, fromServer, NOTE_FIELDS, type NoteDoc} from '../replica/note'
import {pushMutations} from './remote'
import {refetch} from './check'

const BATCH = 50
const ROUNDS = 5
const SENT = 8
const STALE = new Set([404, 409, 412])

type Planned = {e: Entry; m: object | null}

export const remember = (sent: NoteDoc[], note: NoteDoc) => (sent.some((x) => sameContent(x, note)) ? sent : [...sent, note].slice(-SENT))

export function mutationFor(e: Entry, note: NoteDoc | undefined): object | null {
  if (e.delete) return e.base || e.sent?.length ? {delete: {id: e.id, type: 'note', force: true, ...(e.base && {ifRevisionID: e.base._rev})}} : null
  if (!note) return null
  if (!e.base) return {create: {...content(note), _id: e.id, _type: 'note'}}
  const base = e.base
  const changed = NOTE_FIELDS.filter((f) => !same(note[f], base[f]))
  const unset = changed.filter((f) => note[f] === undefined)
  const set = Object.fromEntries(changed.filter((f) => note[f] !== undefined).map((f) => [f, note[f]]))
  return changed.length ? {patch: {id: e.id, type: 'note', set: {...set, by: note.by}, ...(unset.length && {unset}), ifRevisionID: base._rev}} : null
}

async function prepare(ids: string[]): Promise<Planned[]> {
  const tx = (await db()).transaction(['notes', 'outbox'], 'readwrite')
  const [notes, outbox] = [tx.objectStore('notes'), tx.objectStore('outbox')]
  const plan: Planned[] = []
  for (const id of ids) {
    const [e, local] = await Promise.all([outbox.get(id), notes.get(id)])
    if (!e) continue
    const note = local && sign(stored(local), deviceId())
    const m = mutationFor(e, note)
    const sent = m && note && !e.delete ? {...e, sent: remember(e.sent ?? [], note)} : e
    if (sent !== e) void outbox.put(sent)
    plan.push({e: sent, m})
  }
  await tx.done
  return plan
}

async function healed(sent: Entry[]): Promise<boolean> {
  await refetch(new Map(sent.map((e) => [e.id, 'note'])))
  const d = await db()
  const now = await Promise.all(sent.map((e) => d.get('outbox', e.id)))
  return now.some((e, j) => !e || e.base?._rev !== sent[j].base?._rev)
}

async function send(ids: string[]): Promise<boolean> {
  const plan = await prepare(ids)
  for (const {e} of plan.filter((p) => !p.m)) await ack(e, e.delete ? null : e.base)
  const out = plan.filter((p) => p.m)
  if (!out.length) return plan.length > 0
  const res = await pushMutations({data: {mutations: out.map((p) => p.m)}})
  if (res.status === 200) {
    for (const [j, {e}] of out.entries()) {
      const doc = res.docs[j]
      await ack(e, doc && (fromServer(doc) as NoteDoc))
    }
    return true
  }
  if (STALE.has(res.status) && (await healed(out.map((p) => p.e)))) return true
  if (out.length > 1) {
    const half = Math.ceil(out.length / 2)
    const first = await send(out.slice(0, half).map((p) => p.e.id))
    const second = await send(out.slice(half).map((p) => p.e.id))
    return first || second
  }
  await fail(out[0].e, `${res.status} ${res.error ?? ''}`.trim())
  return false
}

const due = (e: Entry) => !e.failed || e.failed.retryAt <= Date.now()

export async function push(): Promise<number | undefined> {
  const d = await db()
  for (let round = 0; round < ROUNDS; round++) {
    const ids = (await d.getAll('outbox')).filter(due).map((e) => e.id)
    let moved = false
    for (let i = 0; i < ids.length; i += BATCH) moved = (await send(ids.slice(i, i + BATCH))) || moved
    if (!moved) break
  }
  const waits = (await d.getAll('outbox')).flatMap((e) => (e.failed ? [e.failed.retryAt - Date.now()] : []))
  return waits.length ? Math.max(0, Math.min(...waits)) : undefined
}
