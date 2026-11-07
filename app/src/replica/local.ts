import {db, deviceId, forgetReplica, NOTE_STORES, stored, type Entry} from './db'
import {toRow, type NotebookDoc, type NoteDoc} from './note'
import {move, tagsTo, tickAt} from './organize'
import {notify} from './bus'
import {failed, forgetJot, forgetJournal, forgetOldMarks, jotJoined, jotted, replayedHere, unjot, unjotReplayed, type Jot, type Jotted, type Step} from './journal'
import {mergeLocal} from './merge'
import {dismiss, keep} from './resolve'
import {markMade, unmark} from './made'
import {emptyParagraph, holdsNothing, type Block} from '../lib/model'

const now = () => new Date().toISOString()

type Change = (note: NoteDoc | undefined, entry: Entry | undefined, notebooks: NotebookDoc[]) => {note: NoteDoc | null; entry: Entry | null} | null

async function write(id: string, change: Change, adopt = false) {
  const tx = (await db()).transaction([...NOTE_STORES, 'notebooks'] as const, 'readwrite')
  const [notes, rows, outbox] = [tx.objectStore('notes'), tx.objectStore('rows'), tx.objectStore('outbox')]
  const [local, entry] = await Promise.all([notes.get(id), outbox.get(id)])
  const next = change(local && stored(local), entry, local ? [] : await tx.objectStore('notebooks').getAll())
  if (!next) return tx.done
  await Promise.all([
    ...(next.note ? [notes.put({...next.note, _gen: adopt ? (local?._gen ?? 0) + 1 : local?._gen}), rows.put(toRow(next.note))] : [notes.delete(id), rows.delete(id)]),
    next.entry ? outbox.put(next.entry) : outbox.delete(id),
    tx.done,
  ])
  notify({kind: 'local', ids: [id]})
}

const bump = (id: string, before: NoteDoc | null, entry: Entry | undefined, extra: Partial<Entry> = {}): Entry =>
  entry ? {...entry, failed: undefined, ...extra, v: entry.v + 1} : {id, base: before?._rev ? before : null, v: 1, at: Date.now(), ...extra}

type Edit = (note: NoteDoc, server: NoteDoc | null) => NoteDoc

const edited =
  (id: string, change: Edit): Change =>
  (note, entry) =>
    note ? {note: {...change(note, entry ? entry.base : note._rev ? note : null), _updatedAt: now()}, entry: bump(id, note, entry)} : null

const edit = (id: string, change: Edit, adopt = false) => write(id, edited(id, change), adopt)

const jottedOf = (id: string) => jotted().find(([each]) => each === id)?.[1]

const withTitle = (title: string) => (n: NoteDoc) => ({...n, title})

const typed = (n: NoteDoc, server: NoteDoc | null, shown: Partial<NoteDoc>, after: Partial<NoteDoc>) => mergeLocal(n, shown, after, now(), `local-${crypto.randomUUID()}`, deviceId(), server)

const overTitle = (shown: string, title: string): Edit => (n, server) => typed(n, server, {title: shown}, {title})

const withBody = (base: Block[], after: Block[]): Edit => (n, server) => typed(n, server, {body: {...n.body, blocks: base}}, {body: {...n.body, blocks: after}})

type Owed = {seq: number; patch: Jot}

const owed = new Map<string, Owed[]>()

const isTitle = (p: Jot) => p.title !== undefined

// A failed edit joins the one before it only where the journal joined their steps, so the owed list and the journal
// stay one to one and a run of failed saves stays one retry per field. An edit another tab already replayed has no
// step left to join, so it stays its own edit, and the replay's mark keeps it from applying again.
function owe(list: Owed[], seq: number, p: Jot, joined?: number): Owed[] {
  const last = joined === undefined ? undefined : list.find((o) => o.seq === joined)
  if (!last) return [...list, {seq, patch: p}]
  const patch = isTitle(p) ? {shown: last.patch.shown, title: p.title} : {base: last.patch.base, after: p.after}
  return [...list.filter((o) => o !== last), {seq, patch}]
}

const editFor = ({patch: p}: Owed): Edit => (isTitle(p) ? overTitle(p.shown ?? '', p.title!) : withBody(p.base!, p.after!))

export const owesWords = (id: string) => owed.has(id)

const owedTitles = new Set<string>()

export const owesTitle = (id: string) => owedTitles.has(id)

const applied = (j: Jotted): Edit => (n, server) => {
  const titled = (j.titles ?? []).reduce((m, t) => (t.shown === undefined ? withTitle(t.title)(m) : overTitle(t.shown, t.title)(m, server)), n)
  return (j.steps ?? []).reduce((m, s) => withBody(s.base, s.after)(m, server), titled)
}

const addsWords = ({base, after}: Step) => after.some((b) => !holdsNothing(b) && !base.some((x) => JSON.stringify(x) === JSON.stringify(b)))

const holdsWords = (j: Jotted) => (j.titles ?? []).some((t) => t.title.trim() && t.title !== t.shown) || (j.steps ?? []).some(addsWords)

export const journalHoldsWords = (id: string) => {
  const j = jottedOf(id)
  return !!j && holdsWords(j)
}

const LATE_SAVE_MS = 5000
const deletedAt = new Map<string, number>()
const justDeleted = (id: string) => Date.now() - (deletedAt.get(id) ?? -Infinity) < LATE_SAVE_MS

const nameOf = (nb: NotebookDoc) => nb.name?.trim() ?? ''

function homeFor(notebooks: NotebookDoc[]) {
  const home = notebooks.find((nb) => nameOf(nb).toLowerCase() === 'inbox') ?? notebooks.filter((nb) => !notebooks.some((x) => x._id === nb.parent?._ref)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)))[0]
  return home && {_type: 'reference' as const, _ref: home._id}
}

const restore = (id: string, j: Jotted | undefined, entry: Entry | undefined, notebooks: NotebookDoc[]) => {
  const home = homeFor(notebooks)
  return entry?.delete || justDeleted(id) || !j || !holdsWords(j)
    ? null
    : {
        note: applied(j)({_id: id, _type: 'note', ...(home && {notebook: home}), title: j.titles?.[0]?.shown ?? '', tags: [], links: [], body: {blocks: j.steps?.[0]?.base ?? [emptyParagraph(`${id}-p0`)]}, _updatedAt: now()}, null),
        entry: bump(id, null, entry, {home}),
      }
}

async function journaled(id: string, patch: Jot) {
  const {seq, joined} = jotJoined(id, patch)
  const owing = () => owe(owed.get(id) ?? [], seq, patch, joined)
  let out: NoteDoc | undefined
  let back: Jotted | undefined
  try {
    await write(id, (note, entry, notebooks) => {
      if (note) {
        const replayed = replayedHere(id)
        return edited(id, (before, server) => (out = owing().filter((o) => !replayed.has(o.seq)).reduce((n, o) => editFor(o)(n, server), before)))(note, entry, notebooks)
      }
      const j = jottedOf(id)
      const next = restore(id, j, entry, notebooks)
      if (next) back = j
      return next
    })
  } catch (e) {
    owed.set(id, owing())
    failed(seq)
    if (patch.title !== undefined) owedTitles.add(id)
    throw e
  }
  owed.delete(id)
  owedTitles.delete(id)
  if (back) unjotReplayed(id, back.seq, true)
  unjot(id, seq)
  return out
}

export const editTitle = (id: string, shown: string, title: string) => journaled(id, {shown, title})

export const moveNote = (id: string, from: string | null, to: string) => edit(id, (n, server) => typed(n, server, ...move(n, from, to)))

export const retag = (id: string, shown: string[], tags: string[]) => edit(id, (n, server) => typed(n, server, ...tagsTo(shown, tags)))

export const tick = (id: string, box: string) => edit(id, (n) => tickAt(n, box))

export const savedTitle = async (id: string) => (await (await db()).get('notes', id))?.title ?? ''

export const keepVersion = (id: string, key: string, shown: Pick<NoteDoc, 'title' | 'body'>) => edit(id, (n, server) => keep(n, key, shown, now(), `local-${crypto.randomUUID()}`, deviceId(), server), true)

export const dismissVersion = (id: string, key: string) => edit(id, (n) => dismiss(n, key))

export async function editBody(id: string, base: Block[], after: Block[]) {
  const out = await journaled(id, {base, after})
  return out?.body?.blocks
}

let replaying: Promise<void> | undefined

export function replayJournal() {
  replaying ??= (async () => {
    await db()
    forgetOldMarks()
    for (const [id] of jotted()) {
      let seq = 0
      let wrote = false
      await write(id, (note, entry, notebooks) => {
        const j = jottedOf(id)
        if (!j) return null
        seq = j.seq
        const next = note ? edited(id, applied(j))(note, entry, notebooks) : restore(id, j, entry, notebooks)
        wrote = !!next
        return next
      })
      if (seq) unjotReplayed(id, seq, wrote)
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
  owed.delete(id)
  owedTitles.delete(id)
  deletedAt.set(id, Date.now())
  forgetJot(id)
  await unmark(id)
}

export async function forgetDevice() {
  forgetJournal()
  await forgetReplica()
}
