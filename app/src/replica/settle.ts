import {db, NOTE_STORES, stored, type Entry, type LocalNote} from './db'
import {reconcile, sameContent} from './merge'
import {toRow, type Doc, type DocType, type NoteDoc, type NotebookDoc} from './note'
import {notify} from './bus'

export type Verdict = 'apply' | 'skip' | 'suspect'
export type Decide = (known: string | undefined) => Verdict

export const casOn = (expected: string | undefined): Decide => (known) => (known === expected ? 'apply' : 'skip')

const knownOf = (entry: Entry | undefined, rev: string | undefined) => (entry ? entry.base?._rev : rev)

export async function knownRevs(type: DocType): Promise<Map<string, string | undefined>> {
  const d = await db()
  if (type === 'notebook') return new Map((await d.getAll('notebooks')).map((nb) => [nb._id, nb._rev]))
  const [rows, outbox] = await Promise.all([d.getAll('rows'), d.getAll('outbox')])
  const known = new Map(rows.map((r) => [r.id, r.rev]))
  for (const e of outbox) known.set(e.id, e.base?._rev)
  return known
}

async function settleNotebook(id: string, theirs: NotebookDoc | null, decide: Decide): Promise<Verdict> {
  const tx = (await db()).transaction('notebooks', 'readwrite')
  const verdict = decide((await tx.store.get(id))?._rev)
  if (verdict === 'apply') void (theirs ? tx.store.put(theirs) : tx.store.delete(id))
  await tx.done
  return verdict
}

async function settleNote(id: string, theirs: NoteDoc | null, decide: Decide, announce: boolean): Promise<Verdict> {
  const tx = (await db()).transaction(NOTE_STORES, 'readwrite')
  const [notes, rows, outbox] = [tx.objectStore('notes'), tx.objectStore('rows'), tx.objectStore('outbox')]
  const [note, entry] = await Promise.all([notes.get(id), outbox.get(id)])
  const verdict = decide(knownOf(entry, note?._rev))
  if (verdict !== 'apply') return tx.done.then(() => verdict)
  const show = (next: NoteDoc | null) => {
    if (!next) {
      void notes.delete(id)
      void rows.delete(id)
      return
    }
    const moved = !note || !sameContent(note, next)
    void notes.put({...next, _gen: (note?._gen ?? 0) + (moved ? 1 : 0)})
    void rows.put(toRow(next))
  }
  const merged = entry ? reconcile(entry.base, note ? stored(note) : null, theirs, new Date().toISOString()) : theirs
  const settled = !entry || (merged && theirs ? sameContent(merged, theirs) : merged === theirs)
  if (settled) {
    if (entry) void outbox.delete(id)
    show(theirs)
  } else {
    void outbox.put({...entry, base: theirs, delete: merged ? undefined : true})
    show(merged && {...merged, _id: id, _type: 'note', _rev: theirs?._rev})
  }
  await tx.done
  if (announce) notify({kind: 'remote', ids: [id]})
  return verdict
}

export async function settle(type: DocType, id: string, theirs: Doc | null, decide: Decide, announce = true): Promise<Verdict> {
  if (type === 'notebook') {
    const verdict = await settleNotebook(id, theirs as NotebookDoc | null, decide)
    if (verdict === 'apply' && announce) notify({kind: 'remote', ids: [id]})
    return verdict
  }
  return settleNote(id, theirs as NoteDoc | null, decide, announce)
}

export async function ack(sent: Entry, doc: NoteDoc | null): Promise<void> {
  const tx = (await db()).transaction(NOTE_STORES, 'readwrite')
  const [notes, rows, outbox] = [tx.objectStore('notes'), tx.objectStore('rows'), tx.objectStore('outbox')]
  const [note, entry] = await Promise.all([notes.get(sent.id), outbox.get(sent.id)])
  if (!entry || entry.base?._rev !== sent.base?._rev) return tx.done
  if (entry.v !== sent.v) void outbox.put({...entry, base: doc})
  else {
    void outbox.delete(sent.id)
    if (doc) {
      void notes.put({...doc, _gen: note?._gen} satisfies LocalNote)
      void rows.put(toRow(doc))
    }
  }
  await tx.done
  notify({kind: 'remote', ids: [sent.id]})
}
