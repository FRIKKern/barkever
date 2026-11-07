import '../chaos/hooks.ts'
import {registerHooks} from 'node:module'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc} from './note.ts'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'

registerHooks({
  resolve(specifier, context, next) {
    const found = next(specifier, context)
    const tab = context.parentURL?.match(/[?&]tab=([^&]+)/)?.[1]
    return tab && found.url.endsWith('/src/replica/journal.ts') ? {...found, url: `${found.url}?tab=${tab}`} : found
  },
})

const {forgetJournal, jotted} = await import('./journal.ts')
const {editBody, editTitle} = await import('./local.ts')

const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const START = [p('a', 'one'), p('b', 'two')]
const FAILED = [p('a', 'one FAILED'), p('b', 'two')]

function device(): Device {
  const d = newDevice('dev-me')
  use(d)
  forgetJournal()
  d.stores.notes.set('n1', {_id: 'n1', _type: 'note', _rev: 'r1', title: 'Plan', tags: [], links: [], body: {blocks: START}} satisfies NoteDoc)
  return d
}

async function failing(d: Device, run: () => Promise<unknown>) {
  const read = d.stores.notes.get
  d.stores.notes.get = () => {
    throw new Error('the disk said no')
  }
  await assert.rejects(run())
  d.stores.notes.get = read
}

let tabs = 0
const newTab = async () => (await import(`./local.ts?tab=t${++tabs}`)) as typeof import('./local.ts')

const note = (d: Device) => d.stores.notes.get('n1') as NoteDoc
const texts = (d: Device) => (note(d).body?.blocks ?? []).map(blockText)
const rawJournal = () => [localStorage.getItem('chaos-dev-me-journal')].filter((v) => v !== null).map((v) => JSON.parse(v))

test('words another tab replayed and the person then removed there stay removed at my next save', async () => {
  const d = device()
  await failing(d, () => editBody('n1', START, FAILED))
  const other = await newTab()
  await other.replayJournal()
  assert.equal(texts(d)[0], 'one FAILED')
  await other.editBody('n1', FAILED, START)
  await editBody('n1', FAILED, [p('a', 'one FAILED'), p('b', 'two x')])
  assert.deepEqual(texts(d), ['one', 'two x'])
  assert.deepEqual(note(d).conflicts ?? [], [])
})

test('a title another tab replayed and the person then renamed there stays renamed at my next save', async () => {
  const d = device()
  await failing(d, () => editTitle('n1', 'Plan', 'Plan FAILED'))
  const other = await newTab()
  await other.replayJournal()
  assert.equal(note(d).title, 'Plan FAILED')
  await other.editTitle('n1', 'Plan FAILED', 'Plan')
  await editBody('n1', START, [p('a', 'one'), p('b', 'two x')])
  assert.equal(note(d).title, 'Plan')
  assert.deepEqual(note(d).conflicts ?? [], [])
})

test('an edit the journal could not hold is still mine to retry after another tab boots', async () => {
  const d = device()
  const write = localStorage.setItem
  localStorage.setItem = () => {
    throw new Error('quota')
  }
  await failing(d, () => editBody('n1', START, FAILED))
  localStorage.setItem = write
  await (await newTab()).replayJournal()
  assert.equal(texts(d)[0], 'one')
  await editBody('n1', FAILED, [p('a', 'one FAILED'), p('b', 'two x')])
  assert.deepEqual(texts(d), ['one FAILED', 'two x'])
})

test("another tab's replayed step with my unjournaled edit's seq doesn't cancel my retry", async () => {
  const d = device()
  const now = Date.now
  const frozen = now()
  Date.now = () => frozen
  const write = localStorage.setItem
  localStorage.setItem = () => {
    throw new Error('quota')
  }
  await failing(d, () => editBody('n1', START, FAILED))
  localStorage.setItem = write
  const other = await newTab()
  await failing(d, () => other.editBody('n1', START, [p('a', 'one'), p('b', 'two OTHER')]))
  Date.now = now
  await (await newTab()).replayJournal()
  assert.equal(texts(d)[1], 'two OTHER')
  await editBody('n1', FAILED, FAILED)
  assert.deepEqual(texts(d), ['one FAILED', 'two OTHER'])
})

const {settle} = await import('./settle.ts')

test('a replay that could not apply my failed words leaves no mark, so they land when a remote edit brings the deleted note back', async () => {
  const d = device()
  await (await newTab()).deleteNote('n1')
  await failing(d, () => editBody('n1', START, FAILED))
  await (await newTab()).replayJournal()
  const theirs = {_id: 'n1', _type: 'note', _rev: 'r2', title: 'Plan', tags: [], links: [], body: {blocks: [...START, p('c', 'three')]}} as NoteDoc
  await settle('note', 'n1', theirs, () => 'apply')
  await editBody('n1', [...FAILED, p('c', 'three')], [p('a', 'one FAILED'), p('b', 'two y'), p('c', 'three')])
  assert.deepEqual(texts(d), ['one FAILED', 'two y', 'three'])
})

test('a replay mark is no journal entry, my next save clears it, and a mark a day old goes at the next boot', async () => {
  const d = device()
  await failing(d, () => editBody('n1', START, FAILED))
  await (await newTab()).replayJournal()
  assert.deepEqual(jotted(), [])
  assert.equal(rawJournal()[0].n1.replayed.length, 1)
  await editBody('n1', FAILED, FAILED)
  assert.deepEqual(rawJournal(), [])

  await failing(d, () => editBody('n1', FAILED, START))
  await (await newTab()).replayJournal()
  await (await newTab()).replayJournal()
  assert.equal(rawJournal()[0].n1.replayed.length, 1, 'a fresh mark outlives the next boot')
  const now = Date.now
  Date.now = () => now() + 25 * 60 * 60 * 1000
  await (await newTab()).replayJournal()
  Date.now = now
  assert.deepEqual(rawJournal(), [])
})
