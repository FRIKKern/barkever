import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {baseFor, reconcile} from '../replica/merge.ts'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc} from '../replica/note.ts'
import {newDevice, use} from '../chaos/fake-db.ts'
import {answer} from '../chaos/fake-remote.ts'

const {mutationFor, push, remember} = await import('./push.ts')

const AT = '2026-10-29T12:00:00.000Z'
const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const note = (rev: string, title: string, blocks: Block[], by?: string): NoteDoc => ({_id: 'n1', _type: 'note', _rev: rev, title, tags: [], links: [], body: {blocks}, by})
const sent = (m: object | null) => JSON.stringify(m)

test('the device-only _typed list never reaches Barkpark, on create or on patch', () => {
  const typed = {...note('r1', 'Plan', []), _typed: ['3.abc.def']}
  const create = mutationFor({id: 'n1', base: null, v: 1, at: 0}, typed)
  const patch = mutationFor({id: 'n1', base: note('r1', 'Old', []), v: 1, at: 0}, typed)
  assert.ok(sent(create).includes('"Plan"') && sent(patch).includes('"Plan"'))
  for (const m of [create, patch]) assert.ok(!sent(m).includes('_typed'), sent(m))
})

test('retrying one unchanged note keeps the push that landed, so a block deleted after it stays deleted', () => {
  const s1 = note('r1', 'T', [p('a', 'one'), p('n', 'new')], 'dev-me')
  const s2 = note('r1', 'T', [p('a', 'one')], 'dev-me')
  let pushes = remember([], s1)
  for (let i = 0; i < 8; i++) pushes = remember(pushes, s2)
  assert.deepEqual(pushes, [s1, s2])
  const r3 = note('r3', 'T2', [p('a', 'one'), p('n', 'new')], 'B')
  assert.deepEqual(reconcile(baseFor(note('r1', 'T', [p('a', 'one')]), pushes, r3), s2, r3, AT, 'dev-me')?.body?.blocks.map(blockText), ['one'])
})

test('sent holds the last 8 distinct pushes: a 9th distinct one drops the oldest, a repeat at the cap drops nothing', () => {
  const v = (i: number) => note('r1', `T${i}`, [p('a', String(i))], 'dev-me')
  let pushes: NoteDoc[] = []
  for (let i = 1; i <= 8; i++) pushes = remember(pushes, v(i))
  assert.deepEqual(remember(pushes, v(8)), pushes)
  assert.deepEqual(remember(pushes, v(1)), pushes)
  assert.deepEqual(remember(pushes, v(9)).map((x) => x.title), ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'])
})

test('a note Barkpark refuses as too large to index keeps its text and its outbox entry, and waits to retry', async () => {
  const d = newDevice('dev-me')
  use(d)
  const big = note('r1', 'Storm', [p('a', 'every version kept')])
  d.stores.notes.set('n1', big)
  d.stores.outbox.set('n1', {id: 'n1', base: note('r1', 'Storm', [p('a', 'before')]), v: 1, at: 0})
  answer({mutate: async () => ({status: 422, docs: [], error: 'searchable_text_too_large'}), docs: async () => [], manifest: async () => ({note: [], notebook: []})})
  const wait = await push()
  const entry = d.stores.outbox.get('n1') as {failed?: {n: number; why: string}}
  assert.deepEqual([entry.failed?.n, entry.failed?.why], [1, '422 searchable_text_too_large'])
  assert.ok(wait! > 0)
  assert.deepEqual((d.stores.notes.get('n1') as NoteDoc).body?.blocks.map(blockText), ['every version kept'])
})
