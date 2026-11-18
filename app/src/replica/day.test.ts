import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'
import {answer} from '../chaos/fake-remote.ts'
import {blockText, type Block} from '../lib/model.ts'
import {dayTitle} from '../lib/today.ts'
import type {NoteDoc} from './note.ts'
import type {ServerDoc} from '../server/sync.ts'
import {exactDeletes, type Delete} from '../server/deletes.ts'

const {deleteForever, editBody, editTitle, makeDay, retag, trashNote} = await import('./local.ts')
const {dropBlankDrafts, dropIfBlank} = await import('./drop.ts')
const {push} = await import('../sync/push.ts')
const {check} = await import('../sync/check.ts')

const ID = 'note-day-2026-11-18'
const DAY = {id: ID, title: dayTitle('2026-11-18'), notebook: 'inbox', blockId: `${ID}-p0`}
const blank: Block[] = [{id: `${ID}-p0`, type: 'paragraph', content: []}]
const said = (text: string): Block[] => [{id: `${ID}-p0`, type: 'paragraph', content: [{type: 'text', value: text}]}]

const on = (d: Device) => (use(d), d)
const doc = (d: Device) => d.stores.notes.get(ID) as NoteDoc | undefined

test('today is made once: a missing note is made with its date title, a second press opens the same one', async () => {
  const d = on(newDevice('dev-a'))
  await Promise.all([makeDay(DAY), makeDay(DAY)])
  assert.deepEqual([d.stores.notes.size, doc(d)?.title, doc(d)?.notebook?._ref], [1, DAY.title, 'inbox'])
  await editBody(ID, blank, said('first thought'))
  await makeDay(DAY)
  assert.deepEqual(doc(d)?.body?.blocks.map(blockText), ['first thought'])
})

test('a today note already on this device, even moved and renamed, is opened as it is', async () => {
  const d = on(newDevice('dev-a'))
  const theirs: NoteDoc = {_id: ID, _type: 'note', _rev: 'r1', title: 'Moved', notebook: {_type: 'reference', _ref: 'work'}, tags: [], links: [], body: {blocks: said('from the phone')}}
  d.stores.notes.set(ID, theirs)
  await makeDay(DAY)
  assert.deepEqual(doc(d), theirs)
  assert.equal(d.stores.outbox.size, 0)
})

test('a today note left untouched goes with the blank sweep and comes back on the next press', async () => {
  const d = on(newDevice('dev-a'))
  await makeDay(DAY)
  await dropBlankDrafts('other')
  assert.equal(doc(d), undefined)
  await makeDay(DAY)
  await dropIfBlank(ID)
  assert.deepEqual([doc(d), d.stores.outbox.size], [undefined, 0])
  await makeDay(DAY)
  await editBody(ID, blank, said('kept'))
  await dropIfBlank(ID)
  assert.deepEqual(doc(d)?.body?.blocks.map(blockText), ['kept'])
})

test('T on a today note in Trash restores it and opens it, words and all, with no second note', async () => {
  const d = on(newDevice('dev-a'))
  await makeDay(DAY)
  await editBody(ID, blank, said('before the bin'))
  await trashNote(ID)
  assert.ok(doc(d)?.trashed)
  await makeDay(DAY)
  assert.deepEqual([d.stores.notes.size, doc(d)?.trashed, doc(d)?.body?.blocks.map(blockText)], [1, undefined, ['before the bin']])
  assert.equal((d.stores.outbox.get(ID) as {delete?: true} | undefined)?.delete, undefined)
})

test('an untouched today note moved to Trash stays there through the sweep, and T brings it back', async () => {
  const d = on(newDevice('dev-a'))
  await makeDay(DAY)
  await trashNote(ID)
  await dropBlankDrafts('other')
  await dropIfBlank(ID)
  assert.ok(doc(d)?.trashed)
  await makeDay(DAY)
  assert.deepEqual([d.stores.notes.size, doc(d)?.trashed, doc(d)?.title], [1, undefined, DAY.title])
})

type Fault = 'down' | 'lost' | undefined

function server(fault: () => Fault = () => undefined) {
  const docs = new Map<string, ServerDoc>()
  let revs = 0
  type M = {create?: ServerDoc; patch?: {id: string; set: Record<string, unknown>; unset?: string[]; ifRevisionID?: string}; delete?: Delete['delete']}
  const apply = (m: M): ServerDoc | null | number => {
    if (m.delete) {
      for (const d of exactDeletes(m as Delete, new Map([...docs.values()].map((x) => [x._id, x])))) {
        if (docs.get(d.delete.id)?._rev !== d.delete.ifRevisionID) return 409
        docs.delete(d.delete.id)
      }
      return null
    }
    if (m.create && docs.has(m.create._id)) return 409
    const was = m.patch && docs.get(m.patch.id)
    if (m.patch && (!was || was._rev !== m.patch.ifRevisionID)) return 409
    const next = {...(m.create ?? {...was!, ...m.patch!.set}), _rev: `r${++revs}`} as ServerDoc
    for (const f of m.patch?.unset ?? []) delete next[f]
    docs.set(next._id, next)
    return next
  }
  answer({
    mutate: async (ms) => {
      const now = fault()
      if (now === 'down') throw new Error('offline')
      const out: (ServerDoc | null)[] = []
      for (const m of JSON.parse(JSON.stringify(ms)) as M[]) {
        const r = apply(m)
        if (typeof r === 'number') return {status: r, docs: [], error: 'conflict'}
        out.push(r)
      }
      if (now === 'lost') throw new Error('the reply never came')
      return {status: 200, docs: out}
    },
    docs: async (_type, ids) => ids.flatMap((id) => docs.get(id) ?? []),
    manifest: async () => ({note: [...docs.values()].map((x) => ({id: x._id, rev: x._rev})), notebook: []}),
  })
  return docs
}

const wordsOf = (n: NoteDoc | undefined) => [...(n?.body?.blocks ?? []), ...(n?.conflicts ?? []).flatMap((c) => c.body?.blocks ?? [])].map(blockText).filter(Boolean).sort()

async function laptopWrote(docs: Map<string, ServerDoc>) {
  on(newDevice('dev-a'))
  await makeDay(DAY)
  await editBody(ID, blank, said('laptop words'))
  await push()
  assert.deepEqual(wordsOf(docs.get(ID) as unknown as NoteDoc), ['laptop words'])
}

const LEAVES: [string, (fault: {now: Fault}) => Promise<void>][] = [
  ['typed a letter, lost the push, erased it and left', async (fault) => {
    await editBody(ID, blank, said('x'))
    fault.now = 'down'
    await push().catch(() => {})
    fault.now = undefined
    await editBody(ID, said('x'), blank)
    await dropIfBlank(ID)
  }],
  ['only added a tag, lost the push, and the sweep ran', async (fault) => {
    await retag(ID, [], ['journal'])
    fault.now = 'down'
    await push().catch(() => {})
    fault.now = undefined
    await dropBlankDrafts('other')
  }],
  ['typed, lost the push, moved it to Trash and deleted it forever', async (fault) => {
    await editBody(ID, blank, said('phone words'))
    fault.now = 'down'
    await push().catch(() => {})
    fault.now = undefined
    await trashNote(ID)
    assert.equal(await deleteForever(ID), true)
  }],
]

for (const [what, leave] of LEAVES)
  test(`a phone that made today before it synced, ${what}, never deletes the laptop’s today note`, async () => {
    const fault: {now: Fault} = {now: undefined}
    const docs = server(() => fault.now)
    await laptopWrote(docs)
    const phone = on(newDevice('dev-b'))
    await makeDay(DAY)
    await leave(fault)
    await push()
    assert.deepEqual(wordsOf(docs.get(ID) as unknown as NoteDoc), ['laptop words'])
    assert.deepEqual([wordsOf(doc(phone)), phone.stores.outbox.size], [['laptop words'], 0])
  })

test('a note whose create landed but whose answer was lost is still deleted when this device leaves it blank', async () => {
  const fault: {now: Fault} = {now: undefined}
  const docs = server(() => fault.now)
  const d = on(newDevice('dev-a'))
  await makeDay(DAY)
  await editBody(ID, blank, said('x'))
  fault.now = 'lost'
  await push().catch(() => {})
  fault.now = undefined
  assert.ok(docs.has(ID))
  await editBody(ID, said('x'), blank)
  await dropIfBlank(ID)
  await push()
  assert.deepEqual([docs.has(ID), doc(d), d.stores.outbox.size], [false, undefined, 0])
})

test('an untouched today note sent to Trash and brought back by T leaves Barkpark when left blank', async () => {
  const docs = server()
  const d = on(newDevice('dev-a'))
  await makeDay(DAY)
  await trashNote(ID)
  await push()
  assert.ok(docs.get(ID)?.trashed)
  await makeDay(DAY)
  await push()
  await dropIfBlank(ID)
  await push()
  assert.deepEqual([docs.has(ID), doc(d), d.stores.outbox.size], [false, undefined, 0])
})

test('a blank today note left here never deletes the words another device typed into it meanwhile', async () => {
  const docs = server()
  const a = on(newDevice('dev-a'))
  await makeDay(DAY)
  await trashNote(ID)
  await push()
  await makeDay(DAY)
  await push()
  on(newDevice('dev-b'))
  await check()
  await editBody(ID, blank, said('phone words'))
  await push()
  on(a)
  await dropIfBlank(ID)
  await push()
  await check()
  assert.deepEqual([wordsOf(docs.get(ID) as unknown as NoteDoc), wordsOf(doc(a))], [['phone words'], ['phone words']])
})

test('a phone that only renamed today keeps the laptop’s words in the note, not in a kept copy', async () => {
  const docs = server()
  await laptopWrote(docs)
  on(newDevice('dev-b'))
  await makeDay(DAY)
  await editTitle(ID, DAY.title, 'Plans')
  await push()
  const kept = docs.get(ID) as unknown as NoteDoc
  assert.deepEqual([kept.title, kept.body?.blocks.map(blockText), kept.conflicts ?? []], ['Plans', ['laptop words'], []])
})

test('two devices that each made today offline end with one note on Barkpark, and no words lost', async () => {
  const docs = server()
  const [a, b] = [newDevice('dev-a'), newDevice('dev-b')]
  on(a)
  await makeDay(DAY)
  await editBody(ID, blank, said('from the laptop'))
  on(b)
  await makeDay(DAY)
  await editBody(ID, blank, said('from the phone'))
  on(a)
  await push()
  on(b)
  await push()
  assert.equal(docs.size, 1)
  const kept = docs.get(ID) as unknown as NoteDoc
  const words = [...(kept.body?.blocks ?? []), ...(kept.conflicts ?? []).flatMap((c) => c.body?.blocks ?? [])].map(blockText)
  assert.deepEqual([kept.title, words.sort()], [DAY.title, ['from the laptop', 'from the phone']])
  assert.equal(b.stores.outbox.size, 0)
})

test('a device that pressed today but typed nothing takes the other device’s note as it is', async () => {
  const docs = server()
  const [a, b] = [newDevice('dev-a'), newDevice('dev-b')]
  on(b)
  await makeDay(DAY)
  on(a)
  await makeDay(DAY)
  await editBody(ID, blank, said('from the laptop'))
  await push()
  on(b)
  await push()
  await check()
  assert.deepEqual([docs.size, b.stores.outbox.size, doc(b)?._rev, doc(b)?.body?.blocks.map(blockText)], [1, 0, 'r1', ['from the laptop']])
})
