import {db, stored, type Entry} from '../replica/db'
import {ack} from '../replica/settle'
import {same} from '../replica/merge'
import {content, fromServer, NOTE_FIELDS, type NoteDoc} from '../replica/note'
import {pushMutations} from './remote'
import {refetch} from './check'

const BATCH = 50
const ROUNDS = 5

export function mutationFor(e: Entry, note: NoteDoc | undefined): object | null {
  if (e.delete) return e.base ? {delete: {id: e.id, type: 'note', ifRevisionID: e.base._rev, force: true}} : null
  if (!note) return null
  if (!e.base) return {create: {...content(note), _id: e.id, _type: 'note'}}
  const base = e.base
  const set = Object.fromEntries(NOTE_FIELDS.filter((f) => !same(note[f], base[f])).map((f) => [f, note[f]]))
  return Object.keys(set).length ? {patch: {id: e.id, type: 'note', set, ifRevisionID: base._rev}} : null
}

async function send(batch: Entry[]): Promise<void> {
  const d = await db()
  const notes = await Promise.all(batch.map((e) => d.get('notes', e.id)))
  const plan = batch.map((e, j) => ({e, m: mutationFor(e, notes[j] && stored(notes[j]))}))
  for (const {e} of plan.filter((p) => !p.m)) await ack(e, e.delete ? null : e.base)
  const out = plan.filter((p) => p.m)
  if (!out.length) return
  const res = await pushMutations({data: {mutations: out.map((p) => p.m)}})
  if (res.status === 412 || res.error === 'conflict') return refetch(new Map(out.map((p) => [p.e.id, 'note'])))
  if (res.status !== 200) throw new Error(`push ${res.status} ${res.error}`)
  for (const [j, {e}] of out.entries()) {
    const doc = res.docs[j]
    await ack(e, doc && (fromServer(doc) as NoteDoc))
  }
}

export async function push(): Promise<void> {
  const d = await db()
  for (let round = 0; round < ROUNDS; round++) {
    const entries = await d.getAll('outbox')
    if (!entries.length) return
    for (let i = 0; i < entries.length; i += BATCH) await send(entries.slice(i, i + BATCH))
  }
}
