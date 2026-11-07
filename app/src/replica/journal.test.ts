import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc} from './note.ts'
import {newDevice, use} from '../chaos/fake-db.ts'

const mine = await import('./journal.ts')
const anotherTab = './journal.ts?tab=other'
const otherTab = (await import(anotherTab)) as typeof mine
const {editBody, replayJournal} = await import('./local.ts')

const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})

const fresh = () => {
  use(newDevice('dev-me'))
  mine.forgetJournal()
}

test('a step that failed here survives another tab saving the same note later', () => {
  fresh()
  mine.jot('n1', {base: [p('a', 'one')], after: [p('a', 'one more')]})
  otherTab.unjot('n1', otherTab.jot('n1', {base: [p('b', 'x')], after: [p('b', 'xy')]}))
  const [[, kept]] = mine.jotted()
  assert.deepEqual(kept.steps?.map((s) => blockText(s.after[0])), ['one more'])
})

test('a title that failed here survives another tab saving the body later', () => {
  fresh()
  mine.jot('n1', {title: 'Rope plan'})
  otherTab.unjot('n1', otherTab.jot('n1', {base: [p('b', 'x')], after: [p('b', 'xy')]}))
  assert.equal(mine.jotted()[0][1].titles?.[0]?.title, 'Rope plan')
})

test('a later save in the same tab clears its own earlier failed step on the same block, whose words it holds', () => {
  fresh()
  mine.jot('n1', {base: [p('a', 'one')], after: [p('a', 'one more')]})
  mine.unjot('n1', mine.jot('n1', {base: [p('a', 'one more')], after: [p('a', 'one more words')]}))
  assert.deepEqual(mine.jotted(), [])
})

test('a step from before this change, with no tab, is left for the next boot', () => {
  fresh()
  const step = mine.jot('n1', {base: [p('a', 'one')], after: [p('a', 'one more')]})
  const raw = JSON.parse(localStorage.getItem('chaos-dev-me-journal')!)
  delete raw.n1.steps[0].tab
  localStorage.setItem('chaos-dev-me-journal', JSON.stringify(raw))
  mine.unjot('n1', step)
  assert.equal(mine.jotted().length, 1)
})

test('a note record that clears and starts again never reuses a seq, so a replay reading the old record leaves a new failed step alone', () => {
  fresh()
  const old = mine.jot('n1', {base: [p('a', 'one')], after: [p('a', 'two')]})
  mine.unjot('n1', old)
  const again = mine.jot('n1', {base: [p('a', 'two')], after: [p('a', 'new failed')]})
  assert.ok(again > old)
  mine.unjotReplayed('n1', old)
  assert.equal(mine.jotted()[0][1].steps?.length, 1)
})

test("a tab's rejected save comes back at the next boot after another tab saved and both closed, and is then gone from the journal", async () => {
  const device = newDevice('dev-me')
  use(device)
  mine.forgetJournal()
  const base = [p('a', 'one')]
  const notes = device.stores.notes
  notes.set('n1', {_id: 'n1', _type: 'note', _rev: 'r1', title: 'T', tags: [], links: [], body: {blocks: base}} satisfies NoteDoc)
  const read = notes.get
  notes.get = () => {
    throw new Error('the disk said no')
  }
  await assert.rejects(editBody('n1', base, [p('a', 'one failed words')]))
  notes.get = read
  otherTab.unjot('n1', otherTab.jot('n1', {base, after: base}))
  await replayJournal()
  assert.deepEqual(((notes.get('n1') as NoteDoc).body?.blocks ?? []).map(blockText), ['one failed words'])
  assert.deepEqual(mine.jotted(), [])
})
