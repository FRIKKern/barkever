import {db, forgetReplica, NOTE_STORES, stored, type Entry} from './db'
import {toRow, type NoteDoc} from './note'
import {notify} from './bus'
import {forgetJournal, jot, jotted, unjot, type Jot} from './journal'
import {mergeCanvas} from './merge'
import {emptyParagraph, type Block} from '../lib/model'

const now = () => new Date().toISOString()

type Change = (note: NoteDoc | undefined, entry: Entry | undefined) => {note: NoteDoc | null; entry: Entry | null} | null

async function write(id: string, change: Change) {
  const tx = (await db()).transaction(NOTE_STORES, 'readwrite')
  const [notes, rows, outbox] = [tx.objectStore('notes'), tx.objectStore('rows'), tx.objectStore('outbox')]
  const [local, entry] = await Promise.all([notes.get(id), outbox.get(id)])
  const next = change(local && stored(local), entry)
  if (!next) return tx.done
  if (next.note) {
    void notes.put({...next.note, _gen: local?._gen})
    void rows.put(toRow(next.note))
  } else {
    void notes.delete(id)
    void rows.delete(id)
  }
  void (next.entry ? outbox.put(next.entry) : outbox.delete(id))
  await tx.done
  notify({kind: 'local', ids: [id]})
}

const bump = (id: string, before: NoteDoc | null, entry: Entry | undefined, extra: Partial<Entry> = {}): Entry =>
  entry ? {...entry, failed: undefined, ...extra, v: entry.v + 1} : {id, base: before, v: 1, at: Date.now(), ...extra}

const edit = (id: string, change: (note: NoteDoc) => NoteDoc) =>
  write(id, (note, entry) => (note ? {note: {...change(note), _updatedAt: now()}, entry: bump(id, note, entry)} : null))

const withTitle = (title: string) => (n: NoteDoc) => ({...n, title})

const withBody = (base: Block[], after: Block[]) => (n: NoteDoc) => mergeCanvas(n, base, after, now(), `local-${crypto.randomUUID()}`)

async function journaled(id: string, patch: Jot, change: (n: NoteDoc) => NoteDoc) {
  const seq = jot(id, patch)
  let out: NoteDoc | undefined
  await edit(id, (before) => (out = change(before)))
  unjot(id, seq)
  return out
}

export const editTitle = (id: string, title: string) => journaled(id, {title}, withTitle(title))

export async function editBody(id: string, base: Block[], after: Block[]) {
  const out = await journaled(id, {base, after}, withBody(base, after))
  return out?.body?.blocks
}

let replaying: Promise<void> | undefined

export function replayJournal() {
  replaying ??= (async () => {
    await db()
    for (const [id, j] of jotted()) {
      await edit(id, (n) => (j.steps ?? []).reduce((m, s) => withBody(s.base, s.after)(m), j.title === undefined ? n : withTitle(j.title)(n)))
      unjot(id, j.seq)
    }
  })()
  return replaying
}

export const createNote = ({id, notebook, blockId, tags = []}: {id: string; notebook: string; blockId: string; tags?: string[]}) =>
  write(id, () => ({
    note: {_id: id, _type: 'note', title: '', notebook: {_type: 'reference', _ref: notebook}, tags, links: [], body: {blocks: [emptyParagraph(blockId)]}, _updatedAt: now()},
    entry: bump(id, null, undefined),
  }))

export const deleteNote = (id: string) =>
  write(id, (note, entry) => {
    if (!note) return null
    if (entry && !entry.base && !entry.pushed) return {note: null, entry: null}
    return {note: null, entry: bump(id, note, entry, {delete: true})}
  })

export async function forgetDevice() {
  forgetJournal()
  await forgetReplica()
}
