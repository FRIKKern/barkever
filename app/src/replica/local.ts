import {db, deviceId, forgetReplica, NOTE_STORES, stored, type Entry} from './db'
import {toRow, type NoteDoc} from './note'
import {move, tagsTo, tickAt} from './organize'
import {notify} from './bus'
import {forgetJournal, jot, jotted, unjot, type Jot} from './journal'
import {mergeLocal} from './merge'
import {dismiss, keep} from './resolve'
import {markMade, unmark} from './made'
import {emptyParagraph, type Block} from '../lib/model'
import type {Spot} from '../lib/board'

const now = () => new Date().toISOString()

type Change = (note: NoteDoc | undefined, entry: Entry | undefined) => {note: NoteDoc | null; entry: Entry | null} | null

async function write(id: string, change: Change, adopt = false) {
  const tx = (await db()).transaction(NOTE_STORES, 'readwrite')
  const [notes, rows, outbox] = [tx.objectStore('notes'), tx.objectStore('rows'), tx.objectStore('outbox')]
  const [local, entry] = await Promise.all([notes.get(id), outbox.get(id)])
  const next = change(local && stored(local), entry)
  if (!next) return tx.done
  if (next.note) {
    void notes.put({...next.note, _gen: adopt ? (local?._gen ?? 0) + 1 : local?._gen})
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
  entry ? {...entry, failed: undefined, ...extra, v: entry.v + 1} : {id, base: before?._rev ? before : null, v: 1, at: Date.now(), ...extra}

type Edit = (note: NoteDoc, server: NoteDoc | null) => NoteDoc

const edit = (id: string, change: Edit, adopt = false) =>
  write(id, (note, entry) => (note ? {note: {...change(note, entry ? entry.base : note._rev ? note : null), _updatedAt: now()}, entry: bump(id, note, entry)} : null), adopt)

const withTitle = (title: string) => (n: NoteDoc) => ({...n, title})

const typed = (n: NoteDoc, server: NoteDoc | null, shown: Partial<NoteDoc>, after: Partial<NoteDoc>) => mergeLocal(n, shown, after, now(), `local-${crypto.randomUUID()}`, deviceId(), server)

const overTitle = (shown: string, title: string): Edit => (n, server) => typed(n, server, {title: shown}, {title})

const withBody = (base: Block[], after: Block[]): Edit => (n, server) => typed(n, server, {body: {...n.body, blocks: base}}, {body: {...n.body, blocks: after}})

async function journaled(id: string, patch: Jot, change: Edit) {
  const seq = jot(id, patch)
  let out: NoteDoc | undefined
  await edit(id, (before, server) => (out = change(before, server)))
  unjot(id, seq)
  return out
}

export const editTitle = (id: string, shown: string, title: string) => journaled(id, {title}, overTitle(shown, title))

export const moveNote = (id: string, from: string | null, to: string) => edit(id, (n, server) => typed(n, server, ...move(n, from, to)))

export const retag = (id: string, shown: string[], tags: string[]) => edit(id, (n, server) => typed(n, server, ...tagsTo(shown, tags)))

export const tick = (id: string, box: Spot) => edit(id, (n, server) => typed(n, server, ...tickAt(n, box)))

export const savedTitle = async (id: string) => (await (await db()).get('notes', id))?.title ?? ''

export const keepVersion = (id: string, key: string, shown: Pick<NoteDoc, 'title' | 'body'>) => edit(id, (n, server) => keep(n, key, shown, now(), `local-${crypto.randomUUID()}`, deviceId(), server), true)

export const dismissVersion = (id: string, key: string) => edit(id, (n) => dismiss(n, key))

export async function editBody(id: string, base: Block[], after: Block[]) {
  const out = await journaled(id, {base, after}, withBody(base, after))
  return out?.body?.blocks
}

let replaying: Promise<void> | undefined

export function replayJournal() {
  replaying ??= (async () => {
    await db()
    for (const [id, j] of jotted()) {
      await edit(id, (n, server) => (j.steps ?? []).reduce((m, s) => withBody(s.base, s.after)(m, server), j.title === undefined ? n : withTitle(j.title)(n)))
      unjot(id, j.seq)
    }
  })()
  return replaying
}

export async function createNote({id, notebook, blockId, tags = []}: {id: string; notebook: string; blockId: string; tags?: string[]}) {
  await markMade(id)
  await write(id, () => ({
    note: {_id: id, _type: 'note', title: '', notebook: {_type: 'reference', _ref: notebook}, tags, links: [], body: {blocks: [emptyParagraph(blockId)]}, _updatedAt: now()},
    entry: null,
  }))
}

export async function deleteNote(id: string) {
  await write(id, (note, entry) => {
    if (!note) return null
    if (!note._rev && !entry?.sent?.length) return {note: null, entry: null}
    return {note: null, entry: bump(id, note, entry, {delete: true})}
  })
  await unmark(id)
}

export async function forgetDevice() {
  forgetJournal()
  await forgetReplica()
}
