import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'
import {answer} from '../chaos/fake-remote.ts'
import {blockText, type Block} from '../lib/model.ts'
import {dayTitle} from '../lib/today.ts'
import type {NoteDoc} from './note.ts'
import type {ServerDoc} from '../server/sync.ts'

const {editBody, makeDay} = await import('./local.ts')
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

function server() {
  const docs = new Map<string, ServerDoc>()
  let revs = 0
  type M = {create?: ServerDoc; patch?: {id: string; set: Record<string, unknown>; ifRevisionID?: string}}
  answer({
    mutate: async (ms) => {
      const out: ServerDoc[] = []
      for (const m of JSON.parse(JSON.stringify(ms)) as M[]) {
        if (m.create && docs.has(m.create._id)) return {status: 409, docs: [], error: 'conflict'}
        const was = m.patch && docs.get(m.patch.id)
        if (m.patch && (!was || was._rev !== m.patch.ifRevisionID)) return {status: 409, docs: [], error: 'rev_mismatch'}
        const next = {...(m.create ?? {...was!, ...m.patch!.set}), _rev: `r${++revs}`} as ServerDoc
        docs.set(next._id, next)
        out.push(next)
      }
      return {status: 200, docs: out}
    },
    docs: async (_type, ids) => ids.flatMap((id) => docs.get(id) ?? []),
    manifest: async () => ({note: [...docs.values()].map((x) => ({id: x._id, rev: x._rev})), notebook: []}),
  })
  return docs
}

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
