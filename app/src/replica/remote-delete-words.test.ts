import '../chaos/hooks.ts'
import {mock, test} from 'node:test'
import assert from 'node:assert/strict'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc} from './note.ts'
import type {Entry} from './db.ts'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'

const {forgetJot, forgetJournal, jot, jotted} = await import('./journal.ts')
const {createNote, deleteNote, editBody, editTitle} = await import('./local.ts')
const {dropIfBlank} = await import('./drop.ts')
const {mutationFor} = await import('../sync/push.ts')

const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const BASE = [p('a', 'one')]
const WORDS = [p('a', 'one failed words')]

function device(): Device {
  const d = newDevice('dev-me')
  use(d)
  forgetJournal()
  d.stores.notes.set('n1', {_id: 'n1', _type: 'note', _rev: 'r1', title: 'Plan', tags: [], links: [], body: {blocks: BASE}} satisfies NoteDoc)
  return d
}

async function rejectedSave(d: Device, go: () => Promise<unknown>) {
  const read = d.stores.notes.get
  d.stores.notes.get = () => {
    throw new Error('the disk said no')
  }
  await assert.rejects(go())
  d.stores.notes.get = read
}

let boots = 0
const freshLocal = async () => {
  const fresh = `./local.ts?boot=${++boots}`
  return (await import(fresh)) as typeof import('./local.ts')
}
const nextBoot = async () => (await freshLocal()).replayJournal()

const bodyOf = (d: Device) => ((d.stores.notes.get('n1') as NoteDoc | undefined)?.body?.blocks ?? []).map(blockText)

test('failed words on a note a remote delete removed come back at the next save, and go out as a create', async () => {
  const d = device()
  await rejectedSave(d, () => editBody('n1', BASE, WORDS))
  d.stores.notes.delete('n1')
  d.stores.rows.delete('n1')
  await editBody('n1', WORDS, [p('a', 'one failed words and more')])
  assert.deepEqual(bodyOf(d), ['one failed words and more'])
  assert.ok(d.stores.rows.has('n1'), 'the note is in the list again')
  const entry = d.stores.outbox.get('n1') as Entry
  assert.ok(JSON.stringify(mutationFor(entry, d.stores.notes.get('n1') as NoteDoc)).includes('"create"'))
  assert.deepEqual(jotted(), [])
})

test('a failed title on a note a remote delete removed comes back as a note with that title', async () => {
  const d = device()
  await rejectedSave(d, () => editTitle('n1', 'Plan', 'Better plan'))
  d.stores.notes.delete('n1')
  await editTitle('n1', 'Better plan', 'Best plan')
  assert.equal((d.stores.notes.get('n1') as NoteDoc).title, 'Best plan')
})

test('a save on a deleted note that changes nothing leaves it deleted', async () => {
  const d = device()
  d.stores.notes.delete('n1')
  await editBody('n1', BASE, BASE)
  assert.equal(d.stores.notes.has('n1'), false)
  assert.deepEqual(jotted(), [])
})

test('words on a note this device deleted stay deleted: the delete clears them', async () => {
  const d = device()
  await rejectedSave(d, () => editBody('n1', BASE, WORDS))
  await deleteNote('n1')
  assert.deepEqual(jotted(), [])
  assert.equal(d.stores.notes.has('n1'), false)
  assert.equal((d.stores.outbox.get('n1') as Entry).delete, true)
})

test('boot replay brings journaled words back when the note is gone, unless a delete from this device is still going out', async () => {
  const d = device()
  jot('n1', {base: BASE, after: WORDS})
  jot('n2', {base: BASE, after: WORDS})
  d.stores.outbox.set('n2', {id: 'n2', base: null, v: 1, at: 0, delete: true})
  d.stores.notes.delete('n1')
  await nextBoot()
  assert.deepEqual(bodyOf(d), ['one failed words'])
  assert.equal(d.stores.notes.has('n2'), false)
  assert.deepEqual(jotted(), [])
})

test('failed words from two tabs on a deleted note both come back, on top of the body they started from', async () => {
  const d = device()
  jot('n1', {base: BASE, after: [p('a', 'one'), p('t1', 'tab one words')]})
  jot('n1', {base: BASE, after: [p('a', 'one'), p('t2', 'tab two words')]})
  d.stores.notes.delete('n1')
  await nextBoot()
  const all = JSON.stringify(d.stores.notes.get('n1'))
  for (const words of ['one', 'tab one words', 'tab two words']) assert.ok(all.includes(words), `${words} is kept`)
  assert.deepEqual(jotted(), [])
})

test('leaving a new note whose words only another tab left in the journal keeps it, and the words are back at the next boot', async () => {
  const d = newDevice('dev-me')
  use(d)
  forgetJournal()
  await createNote({id: 'n3', notebook: 'nb', blockId: 'n3-p0'})
  const otherTab = './journal.ts?tab=other'
  const other = (await import(otherTab)) as typeof import('./journal.ts')
  other.jot('n3', {base: [p('n3-p0', '')], after: [p('n3-p0', 'first words')]})
  await dropIfBlank('n3')
  assert.ok(d.stores.notes.has('n3'), 'the draft is not dropped')
  await nextBoot()
  assert.ok(JSON.stringify(d.stores.notes.get('n3')).includes('first words'))
})

test('leaving a new note this tab owes words to keeps it', async () => {
  const d = newDevice('dev-me')
  use(d)
  forgetJournal()
  await createNote({id: 'n5', notebook: 'nb', blockId: 'n5-p0'})
  await rejectedSave(d, () => editBody('n5', [p('n5-p0', '')], [p('n5-p0', 'first words')]))
  forgetJournal()
  await dropIfBlank('n5')
  assert.ok(d.stores.notes.has('n5'))
})

test('a blank new note with nothing in the journal is still dropped', async () => {
  const d = newDevice('dev-me')
  use(d)
  forgetJournal()
  await createNote({id: 'n4', notebook: 'nb', blockId: 'n4-p0'})
  await dropIfBlank('n4')
  assert.equal(d.stores.notes.has('n4'), false)
})

test('a save that arrives after this tab deleted the note does not bring it back', async () => {
  const d = device()
  await deleteNote('n1')
  d.stores.outbox.delete('n1')
  await editBody('n1', BASE, WORDS)
  await editTitle('n1', 'Plan', 'Late')
  assert.equal(d.stores.notes.has('n1'), false)
  assert.deepEqual(jotted(), [])
})

test('clearing the title of a deleted note leaves it deleted', async () => {
  const d = device()
  d.stores.notes.delete('n1')
  await (await freshLocal()).editTitle('n1', 'Plan', '')
  assert.equal(d.stores.notes.has('n1'), false)
})

test('five seconds after a delete from this tab, failed words on the same id come back again', async () => {
  const d = device()
  await deleteNote('n1')
  d.stores.outbox.delete('n1')
  mock.timers.enable({apis: ['Date'], now: Date.now() + 6000})
  try {
    await editBody('n1', BASE, WORDS)
  } finally {
    mock.timers.reset()
  }
  assert.deepEqual(bodyOf(d), ['one failed words'])
})

test('erasing everything or adding only a blank line on a deleted note leaves it deleted', async () => {
  const d = device()
  d.stores.notes.delete('n1')
  jot('n1', {base: BASE, after: [p('a', '')]})
  jot('n1', {base: BASE, after: [...BASE, p('b', '')]})
  await nextBoot()
  assert.equal(d.stores.notes.has('n1'), false)
  assert.deepEqual(jotted(), [])
})

test('a restore clears the other tabs words it took in, so a later delete elsewhere holds at the next boot', async () => {
  const d = device()
  d.stores.notes.delete('n1')
  const otherTab = './journal.ts?tab=other'
  const other = (await import(otherTab)) as typeof import('./journal.ts')
  other.jot('n1', {base: BASE, after: [...BASE, p('t2', 'other tab words')]})
  await (await freshLocal()).editBody('n1', BASE, [...BASE, p('t1', 'this tab words')])
  const all = JSON.stringify(d.stores.notes.get('n1'))
  for (const words of ['other tab words', 'this tab words']) assert.ok(all.includes(words), `${words} is kept`)
  assert.deepEqual(jotted(), [])
})

test('a title save on a deleted note that names the same title leaves it deleted', async () => {
  const d = device()
  d.stores.notes.delete('n1')
  await (await freshLocal()).editTitle('n1', 'Plan', 'Plan')
  assert.equal(d.stores.notes.has('n1'), false)
  assert.deepEqual(jotted(), [])
})

test('a failed title on a deleted note comes back as what was typed, with no clash against an empty title', async () => {
  const d = device()
  await rejectedSave(d, () => editTitle('n1', 'Plan', 'Better plan'))
  d.stores.notes.delete('n1')
  await nextBoot()
  const n = d.stores.notes.get('n1') as NoteDoc
  assert.equal(n.title, 'Better plan')
  assert.deepEqual(n.conflicts ?? [], [])
})

test('a replay that read the journal before another tab deleted the note does not bring it back', async () => {
  const d = device()
  jot('n1', {base: BASE, after: WORDS})
  d.stores.notes.delete('n1')
  const read = d.stores.notes.get
  d.stores.notes.get = (id: string) => {
    forgetJot('n1')
    return read.call(d.stores.notes, id)
  }
  await nextBoot()
  d.stores.notes.get = read
  assert.equal(d.stores.notes.has('n1'), false)
})

test('a failed body save, then a title save that lands: the words land too, and the journal is empty', async () => {
  const d = device()
  await rejectedSave(d, () => editBody('n1', BASE, WORDS))
  await editTitle('n1', 'Plan', 'Better plan')
  const n = d.stores.notes.get('n1') as NoteDoc
  assert.equal(n.title, 'Better plan')
  assert.deepEqual(bodyOf(d), ['one failed words'])
  assert.deepEqual(jotted(), [])
})

test('a failed new paragraph is not dropped by the next body save', async () => {
  const d = device()
  const added = [...BASE, p('b', 'new paragraph')]
  await rejectedSave(d, () => editBody('n1', BASE, added))
  const blocks = await editBody('n1', added, [...added, p('c', 'next')])
  assert.deepEqual((blocks ?? []).map(blockText), ['one', 'new paragraph', 'next'])
})

function jotDuringReplayRead(d: Device, id: string, after: Block[]) {
  const read = d.stores.notes.get
  d.stores.notes.get = (key: string) => {
    d.stores.notes.get = read
    jot(id, {base: WORDS, after})
    return read.call(d.stores.notes, key)
  }
}

test('a replay on a note that exists applies the journal as it stands at the write, and clears all of it', async () => {
  const d = device()
  jot('n1', {base: BASE, after: WORDS})
  jotDuringReplayRead(d, 'n1', [p('a', 'one failed words and more')])
  await nextBoot()
  assert.deepEqual(bodyOf(d), ['one failed words and more'])
  assert.deepEqual(jotted(), [])
})

test('a replay that restores a note clears a step jotted just before the write, which it took in', async () => {
  const d = device()
  jot('n1', {base: BASE, after: WORDS})
  d.stores.notes.delete('n1')
  jotDuringReplayRead(d, 'n1', [p('a', 'one failed words and more')])
  await nextBoot()
  assert.deepEqual(bodyOf(d), ['one failed words and more'])
  assert.deepEqual(jotted(), [])
})
