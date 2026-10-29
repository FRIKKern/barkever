import {db, forgetReplica, NOTE_STORES, stored, type Entry} from './db'
import {toRow, type NoteDoc} from './note'
import {notify} from './bus'
import {forgetJournal, jot, jotted, unjot, type Jotted} from './journal'
import {applyOps, type BlockOp} from './ops'
import {emptyParagraph, wikilinks, type Block} from '../lib/model'
import {linkRefs} from '../lib/note-docs'

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
  entry ? {...entry, ...extra, v: entry.v + 1} : {id, base: before, v: 1, at: Date.now(), ...extra}

const edit = (id: string, change: (note: NoteDoc) => NoteDoc) =>
  write(id, (note, entry) => (note ? {note: {...change(note), _updatedAt: now()}, entry: bump(id, note, entry)} : null))

const withTitle = (title: string) => (n: NoteDoc) => ({...n, title})

function withBlocks(blocks: Block[]) {
  return (n: NoteDoc) => {
    const links = wikilinks(blocks)
    const had = (n.links ?? []).map((l) => l._ref)
    const same = links.length === had.length && links.every((l) => had.includes(l))
    return {...n, body: {...n.body, blocks}, ...(same ? {} : {links: linkRefs(links)})}
  }
}

const withBody = (ops: BlockOp[], after: Block[]) => (n: NoteDoc) => withBlocks(applyOps(n.body?.blocks ?? [], ops, after))(n)

async function journaled(id: string, patch: Omit<Jotted, 'seq'>, change: (n: NoteDoc) => NoteDoc) {
  const seq = jot(id, patch)
  let out: {before: NoteDoc; after: NoteDoc} | undefined
  await edit(id, (before) => (out = {before, after: change(before)}).after)
  unjot(id, seq)
  return out
}

export const editTitle = (id: string, title: string) => journaled(id, {title}, withTitle(title))

export async function editBody(id: string, ops: BlockOp[], after: Block[]) {
  const out = await journaled(id, {ops, after}, withBody(ops, after))
  return out && {before: out.before.body?.blocks ?? [], blocks: out.after.body?.blocks ?? []}
}

let replaying: Promise<void> | undefined

export function replayJournal() {
  replaying ??= (async () => {
    await db()
    for (const [id, j] of jotted()) {
      await edit(id, (n) => {
        const titled = j.title === undefined ? n : withTitle(j.title)(n)
        return j.ops && j.after ? withBody(j.ops, j.after)(titled) : titled
      })
      unjot(id, j.seq)
    }
  })()
  return replaying
}

export const createNote = ({id, notebook, blockId}: {id: string; notebook: string; blockId: string}) =>
  write(id, () => ({
    note: {_id: id, _type: 'note', title: '', notebook: {_type: 'reference', _ref: notebook}, tags: [], links: [], body: {blocks: [emptyParagraph(blockId)]}, _updatedAt: now()},
    entry: bump(id, null, undefined),
  }))

export const deleteNote = (id: string) =>
  write(id, (note, entry) => {
    if (!note) return null
    if (entry && !entry.base) return {note: null, entry: null}
    return {note: null, entry: bump(id, note, entry, {delete: true})}
  })

export async function forgetDevice() {
  forgetJournal()
  await forgetReplica()
}
