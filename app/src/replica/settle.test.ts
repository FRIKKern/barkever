import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newDevice, use} from '../chaos/fake-db.ts'
import {mergeLocal, reconcile} from './merge.ts'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc as Note} from './note.ts'

const {ack, settle} = await import('./settle.ts')

const AT = '2026-10-29T12:00:00.000Z'
const ME = 'dev-me'
const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const note = (rev: string, title: string, by?: string, blocks: Block[] = []): Note => ({_id: 'n1', _type: 'note', _rev: rev, title, tags: [], links: [], body: {blocks}, by})

test('the typed-from list lasts until the next ack, so another writer reverting to an older title I typed from keeps a copy', async () => {
  const d = newDevice(ME)
  use(d)
  const typed = mergeLocal(note('r1', 'Meeting'), {title: 'Meeting'}, {title: 'Meeting notes'}, AT, 'local-1', ME, null)
  assert.equal(typed._typed?.length, 1)
  d.stores.notes.set('n1', typed)
  const entry = {id: 'n1', base: note('r1', 'Meeting'), v: 1, at: 0, sent: [typed]}
  d.stores.outbox.set('n1', entry)
  await ack(entry, note('r2', 'Meeting notes', ME))
  const acked = d.stores.notes.get('n1') as Note
  assert.equal(acked._typed, undefined)
  const again = mergeLocal(acked, {title: 'Meeting notes'}, {title: 'Meeting notes v2'}, AT, 'local-2', ME, null)
  const out = reconcile(acked, again, note('r3', 'Meeting', 'B'), AT, ME)!
  assert.deepEqual([out.title, out.conflicts?.map((c) => c.title)], ['Meeting notes v2', ['Meeting']])
})

test('a clean catch-up drops the typed-from list too', async () => {
  const d = newDevice(ME)
  use(d)
  d.stores.notes.set('n1', {...note('r1', 'Plan'), _typed: ['3.abc.def']})
  await settle('note', 'n1', note('r2', 'Plan B', 'B'), () => 'apply')
  assert.deepEqual([(d.stores.notes.get('n1') as Note).title, (d.stores.notes.get('n1') as Note)._typed], ['Plan B', undefined])
})

test('catch-up weighs every push since the last ack: a block made in an earlier one and deleted since stays deleted', async () => {
  const d = newDevice(ME)
  use(d)
  const [made, gone] = [note('r1', 'T', ME, [p('a', 'one'), p('n', 'new')]), note('r1', 'T', ME, [p('a', 'one')])]
  d.stores.notes.set('n1', gone)
  d.stores.outbox.set('n1', {id: 'n1', base: note('r1', 'T', undefined, [p('a', 'one')]), v: 2, at: 0, sent: [made, gone]})
  await settle('note', 'n1', note('r3', 'T2', 'B', [p('a', 'one'), p('n', 'new')]), () => 'apply')
  const n = d.stores.notes.get('n1') as Note
  assert.deepEqual([n.title, n.body?.blocks.map(blockText)], ['T2', ['one']])
})

test('a push that landed under newer typing is forgotten with its base: catch-up and ack both clear sent', async () => {
  const d = newDevice(ME)
  use(d)
  const landed = note('r1', 'T', ME, [p('a', 'one')])
  d.stores.notes.set('n1', note('r1', 'T', ME, [p('a', 'one more')]))
  d.stores.outbox.set('n1', {id: 'n1', base: note('r0', 'T'), v: 2, at: 0, sent: [landed]})
  await settle('note', 'n1', {...landed, _rev: 'r2'}, () => 'apply')
  const caught = d.stores.outbox.get('n1') as {base: Note; sent?: Note[]}
  assert.deepEqual([caught.base._rev, caught.sent], ['r2', undefined])
  d.stores.outbox.set('n1', {...caught, v: 3, sent: [note('r2', 'T', ME, [p('a', 'one more')])]})
  await ack({id: 'n1', base: caught.base, v: 2, at: 0}, note('r3', 'T', ME, [p('a', 'one more')]))
  const acked = d.stores.outbox.get('n1') as {base: Note; sent?: Note[]}
  assert.deepEqual([acked.base._rev, acked.sent], ['r3', undefined])
})
