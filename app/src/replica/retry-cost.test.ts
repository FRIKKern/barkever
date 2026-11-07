import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc} from './note.ts'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'

const {forgetJournal, jotted} = await import('./journal.ts')
const {editBody, editTitle} = await import('./local.ts')

const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const START = Array.from({length: 100}, (_, i) => p(`b${i}`, `Paragraph ${i} with some words in it`))
const typedAt = (blocks: Block[], i: number, text: string) => blocks.map((b, j) => (j === i ? p(b.id, text) : b))

function device(): Device {
  const d = newDevice('dev-me')
  use(d)
  forgetJournal()
  d.stores.notes.set('n1', {_id: 'n1', _type: 'note', _rev: 'r1', title: 'Plan', tags: [], links: [], body: {blocks: START}} satisfies NoteDoc)
  return d
}

async function failing(d: Device, run: () => Promise<void>) {
  const read = d.stores.notes.get
  d.stores.notes.get = () => {
    throw new Error('the disk said no')
  }
  await run()
  d.stores.notes.get = read
}

async function typeFailing(d: Device, saves: number) {
  let blocks = START
  let title = 'Plan'
  await failing(d, async () => {
    for (let i = 0; i < saves; i++) {
      const after = typedAt(blocks, 50, `Paragraph 50 typed ${i}`)
      await editBody('n1', blocks, after).catch(() => {})
      blocks = after
      await editTitle('n1', title, `Plan ${i}`).catch(() => {})
      title = `Plan ${i}`
    }
  })
  return {blocks, title}
}

const note = (d: Device) => d.stores.notes.get('n1') as NoteDoc
const texts = (d: Device) => (note(d).body?.blocks ?? []).map(blockText)

test('300 failed saves of title and body leave one journal step and one title, and the next save lands every word', async () => {
  const d = device()
  const {blocks, title} = await typeFailing(d, 300)
  const [[, j]] = jotted()
  assert.equal(j.steps?.length, 1)
  assert.equal(j.titles?.length, 1)
  const t0 = performance.now()
  await editBody('n1', blocks, typedAt(blocks, 50, 'final words'))
  const after300 = performance.now() - t0
  const t1 = performance.now()
  await editBody('n1', typedAt(blocks, 50, 'final words'), typedAt(blocks, 50, 'final words'))
  const plain = performance.now() - t1
  console.log(`      save after 300 failed saves on a 100-block note: ${after300.toFixed(1)} ms, a plain save ${plain.toFixed(1)} ms`)
  assert.ok(after300 < 50 || after300 < plain * 5, `${after300} ms after 300 failed saves, ${plain} ms plain`)
  assert.equal(texts(d)[50], 'final words')
  assert.equal(note(d).title, title)
  assert.deepEqual(note(d).conflicts ?? [], [])
  assert.deepEqual(jotted(), [])
})

test('failed saves around a remote edit in another block keep both', async () => {
  const d = device()
  const {blocks} = await typeFailing(d, 3)
  d.stores.notes.set('n1', {...note(d), _rev: 'r2', body: {blocks: typedAt(START, 10, 'remote words')}})
  await editBody('n1', blocks, typedAt(blocks, 50, 'final words'))
  assert.equal(texts(d)[10], 'remote words')
  assert.equal(texts(d)[50], 'final words')
  assert.equal(note(d).title, 'Plan 2')
})

test('failed saves over a remote edit of the same block keep mine as the main text and theirs as a copy', async () => {
  const d = device()
  const {blocks} = await typeFailing(d, 3)
  d.stores.notes.set('n1', {...note(d), _rev: 'r2', title: 'Remote title', body: {blocks: typedAt(START, 50, 'remote words')}})
  await editBody('n1', blocks, typedAt(blocks, 50, 'final words'))
  assert.equal(texts(d)[50], 'final words')
  const all = JSON.stringify(note(d).conflicts ?? [])
  assert.ok(all.includes('remote words'), all)
  assert.ok(JSON.stringify(note(d)).includes('Remote title'))
})

test('a failed edit that does not carry on from the last one stays its own step', async () => {
  const d = device()
  await failing(d, async () => {
    await editBody('n1', START, typedAt(START, 1, 'one')).catch(() => {})
    await editBody('n1', START, typedAt(START, 2, 'two')).catch(() => {})
  })
  assert.equal(jotted()[0][1].steps?.length, 2)
  await editBody('n1', typedAt(START, 1, 'one'), typedAt(START, 1, 'one'))
  assert.equal(texts(d)[1], 'one')
  assert.equal(texts(d)[2], 'two')
})

test('a failed title, then a rename from elsewhere I type over, keeps what I typed, and the failed title as a copy', async () => {
  const d = device()
  await failing(d, async () => {
    await editTitle('n1', 'Plan', 'Plan A').catch(() => {})
  })
  d.stores.notes.set('n1', {...note(d), _rev: 'r2', title: 'Renamed elsewhere'})
  await failing(d, async () => {
    await editTitle('n1', 'Renamed elsewhere', 'Renamed elsewhere, then mine').catch(() => {})
  })
  await editBody('n1', START, typedAt(START, 1, 'saved'))
  assert.equal(note(d).title, 'Renamed elsewhere, then mine')
  assert.ok((note(d).conflicts ?? []).some((c) => c.title === 'Plan A'), 'the failed title is kept as a copy')
})

let boots = 0
const otherTabBoots = async () => {
  const fresh = `./local.ts?boot=${++boots}`
  await ((await import(fresh)) as typeof import('./local.ts')).replayJournal()
}

test('a failed edit another tab replayed is not joined, so my next save makes no copy of my own words', async () => {
  const d = device()
  const a0 = typedAt(START, 1, 'one more')
  await failing(d, async () => {
    await editBody('n1', START, a0).catch(() => {})
    await editTitle('n1', 'Plan', 'Plan A').catch(() => {})
  })
  await otherTabBoots()
  assert.equal(texts(d)[1], 'one more')
  assert.equal(note(d).title, 'Plan A')
  await editBody('n1', a0, typedAt(START, 1, 'one more words'))
  await editTitle('n1', 'Plan A', 'Plan AB')
  assert.equal(texts(d)[1], 'one more words')
  assert.equal(note(d).title, 'Plan AB')
  assert.deepEqual(note(d).conflicts ?? [], [])
})

test('a joined journal step replays from its first base and first shown title, so the next boot makes no copy', async () => {
  const d = device()
  await typeFailing(d, 3)
  await otherTabBoots()
  assert.equal(texts(d)[50], 'Paragraph 50 typed 2')
  assert.equal(note(d).title, 'Plan 2')
  assert.deepEqual(note(d).conflicts ?? [], [])
  assert.deepEqual(jotted(), [])
})

test('when the journal cannot be written, a failed edit is not joined, so a replay elsewhere leaves no copy of my words', async () => {
  const d = device()
  const a0 = typedAt(START, 1, 'one more')
  const a1 = typedAt(START, 1, 'one more words')
  await failing(d, async () => {
    await editBody('n1', START, a0).catch(() => {})
    const write = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('quota')
    }
    await editBody('n1', a0, a1).catch(() => {})
    localStorage.setItem = write
  })
  await otherTabBoots()
  await editBody('n1', a1, typedAt(START, 1, 'one more words again'))
  assert.equal(texts(d)[1], 'one more words again')
  assert.deepEqual(note(d).conflicts ?? [], [])
})
