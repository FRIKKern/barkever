import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'

const device: Device = newDevice('A')
use(device)
const {markDirty, markSaved, recorded, savePoint, stage, unsynced, unsyncedNow} = await import('./saver.ts')
const {db} = await import('../replica/db.ts')
const {notify} = await import('../replica/bus.ts')
const {deleteNote, editBody, editTitle, owesWords, tick} = await import('../replica/local.ts')
const {dropIfBlank} = await import('../replica/drop.ts')
const {markMade} = await import('../replica/made.ts')
const {forgetJournal, jot, jotted} = await import('../replica/journal.ts')
const settled = () => new Promise((r) => setTimeout(r, 5))
const entry = (id: string) => ({id, base: null, v: 1, at: 0}) as never

test('nothing is Saved before the outbox has been read once', () => {
  assert.equal(stage('n0'), 'queued')
  assert.equal(unsynced(), null)
})

test('sign-out reads the outbox itself: the count is there before the first read lands', async () => {
  const d = await db()
  await d.put('outbox', entry('first'))
  assert.equal(unsynced(), null)
  assert.equal(await unsyncedNow(), 1)
  await d.delete('outbox', 'first')
  assert.equal(await unsyncedNow(), 0)
})

test('a save that lands while newer typing waits is still typed', async () => {
  markDirty('n1', 'body')
  const first = savePoint('n1', 'body')
  markDirty('n1', 'body')
  markSaved('n1', 'body', first)
  await settled()
  assert.equal(stage('n1'), 'typed')
  markSaved('n1', 'body', savePoint('n1', 'body'))
  await settled()
  assert.equal(stage('n1'), 'saved')
})

test('a title save never covers body typing, even typing that came first', async () => {
  markDirty('t1', 'body')
  markDirty('t1', 'title')
  markSaved('t1', 'title', savePoint('t1', 'title'))
  await settled()
  assert.equal(stage('t1'), 'typed')
  markSaved('t1', 'body', savePoint('t1', 'body'))
  await settled()
  assert.equal(stage('t1'), 'saved')
})

test('a stored note stays queued until the outbox lets it go', async () => {
  const d = await db()
  await d.put('outbox', entry('n2'))
  markDirty('n2', 'body')
  markSaved('n2', 'body', savePoint('n2', 'body'))
  await settled()
  assert.equal(stage('n2'), 'queued')
  await d.delete('outbox', 'n2')
  notify({kind: 'remote', ids: ['n2']})
  await settled()
  assert.equal(stage('n2'), 'saved')
})

test('the unsynced count holds typed notes not yet stored plus the outbox, each once', async () => {
  const d = await db()
  await d.put('outbox', entry('n3'))
  await d.put('outbox', entry('n4'))
  markDirty('n4', 'body')
  markDirty('n5', 'title')
  notify({kind: 'local', ids: ['n3']})
  await settled()
  assert.equal(unsynced(), 3)
})

test('an outbox that cannot be read says so, without an unhandled rejection, and recovers on the next change', async (t) => {
  const outbox = device.stores.outbox
  const warn = t.mock.method(console, 'warn', () => {})
  const rejections: unknown[] = []
  const onRejection = (e: unknown) => rejections.push(e)
  process.on('unhandledRejection', onRejection)
  device.stores.outbox = {keys: () => { throw new Error('disk gone') }} as never
  notify({kind: 'local', ids: ['n6']})
  await settled()
  assert.equal(stage('n6'), 'unchecked')
  assert.equal(warn.mock.callCount(), 1)
  device.stores.outbox = outbox
  notify({kind: 'local', ids: ['n6']})
  await settled()
  process.off('unhandledRejection', onRejection)
  assert.equal(stage('n6'), 'saved')
  assert.deepEqual(rejections, [])
})


test('sign-out counts typed notes and words only the journal holds, and answers null when the outbox cannot be read', async () => {
  const before = (await unsyncedNow())!
  jot('j1', {title: 'held'})
  assert.equal(await unsyncedNow(), before + 1)
  forgetJournal()
  markDirty('j2', 'title')
  assert.equal(await unsyncedNow(), before + 1)
  markSaved('j2', 'title', savePoint('j2', 'title'))
  await settled()
  const outbox = device.stores.outbox
  device.stores.outbox = {keys: () => { throw new Error('disk gone') }} as never
  assert.equal(await unsyncedNow(), null)
  device.stores.outbox = outbox
  notify({kind: 'local', ids: ['j2']})
  await settled()
})

const para = (id: string, value: string) => ({id, type: 'paragraph', content: [{type: 'text', value}]})
const bodyOf = (n: {body: {blocks: {content: {value: string}[]}[]}}) => n.body.blocks.map((b) => b.content[0].value)
const inFailure = <T>(write: () => Promise<T>) => {
  const notes = device.stores.notes
  const broken = new Map(notes)
  broken.set = () => { throw new Error('quota') }
  device.stores.notes = broken
  return write().finally(() => void (device.stores.notes = notes))
}
const clean = async (id: string) => {
  const d = await db()
  await d.delete('outbox', id)
  await d.delete('notes', id)
  notify({kind: 'local', ids: [id]})
  await settled()
}
const stored = async (id: string) => (await (await db()).get('notes', id)) as never as {title: string; body: {blocks: never[]}; conflicts?: unknown[]}
const journalOf = (id: string) => jotted().find(([x]) => x === id)?.[1]

async function failing(t: {mock: {method: (o: object, m: string, f: () => void) => {mock: {callCount: () => number}}}}, run: () => Promise<void>) {
  const warn = t.mock.method(console, 'warn', () => {})
  const rejections: unknown[] = []
  const onRejection = (e: unknown) => rejections.push(e)
  process.on('unhandledRejection', onRejection)
  await run()
  await settled()
  process.off('unhandledRejection', onRejection)
  assert.deepEqual(rejections, [])
  return warn
}

test('a failed body step in one block lands inside the next save of another block, with no copy; unsaved and counted until then', async (t) => {
  const d = await db()
  await d.put('notes', {_id: 'w1', _type: 'note', title: 'T', _rev: 'r1', body: {blocks: [para('a', 'old A'), para('b', 'old B')]}} as never)
  await failing(t, async () => {
    const before = (await unsyncedNow())!
    const steps = [[para('a', 'old A'), para('b', 'old B')], [para('a', 'WORDS IN A'), para('b', 'old B')], [para('a', 'WORDS IN A'), para('b', 'more B')]]
    await inFailure(() => recorded('w1', editBody('w1', steps[0], steps[1])))
    await settled()
    assert.equal(stage('w1'), 'unsaved')
    assert.equal(await unsyncedNow(), before + 1)
    assert.equal(unsynced(), before + 1)
    assert.equal(journalOf('w1')?.steps?.length, 1)
    notify({kind: 'remote', ids: ['w1']})
    await settled()
    assert.equal(stage('w1'), 'unsaved')
    await recorded('w1', editBody('w1', steps[1], steps[2]))
    await settled()
    assert.equal(stage('w1'), 'queued')
    assert.deepEqual(bodyOf((await stored('w1')) as never), ['WORDS IN A', 'more B'])
    assert.equal((await stored('w1')).conflicts?.length ?? 0, 0)
    assert.equal(journalOf('w1'), undefined)
  })
  await clean('w1')
})

test('a failed title lands inside the next body save, and two failed titles in a row make no copy', async (t) => {
  const d = await db()
  await d.put('notes', {_id: 'w2', _type: 'note', title: 'Before', _rev: 'r1', body: {blocks: [para('a', 'one')]}} as never)
  await failing(t, async () => {
    await inFailure(() => recorded('w2', editTitle('w2', 'Before', 'First')))
    await inFailure(() => recorded('w2', editTitle('w2', 'First', 'Second')))
    assert.equal(stage('w2'), 'unsaved')
    assert.equal(journalOf('w2')?.title, 'Second')
    await recorded('w2', editBody('w2', [para('a', 'one')], [para('a', 'one two')]))
    await settled()
    assert.notEqual(stage('w2'), 'unsaved')
    assert.equal((await stored('w2')).title, 'Second')
    assert.deepEqual(bodyOf((await stored('w2')) as never), ['one two'])
    assert.equal((await stored('w2')).conflicts?.length ?? 0, 0)
    assert.equal(journalOf('w2'), undefined)
  })
  await clean('w2')
})

test('a failed tick is unsaved until a tick lands, and a landed tick leaves failed words unsaved', async (t) => {
  const d = await db()
  const list = {id: 'l', type: 'list', task: true, items: [{content: [{type: 'text', value: 'x'}], checked: false}]}
  await d.put('notes', {_id: 'w3', _type: 'note', title: 'T', _rev: 'r1', body: {blocks: [list]}} as never)
  await failing(t, async () => {
    const box = 'no-line'
    const before = (await unsyncedNow())!
    await inFailure(() => recorded('w3', tick('w3', box)))
    assert.equal(stage('w3'), 'unsaved')
    assert.equal(await unsyncedNow(), before + 1)
    await recorded('w3', tick('w3', box))
    await settled()
    assert.notEqual(stage('w3'), 'unsaved')
    await inFailure(() => recorded('w3', editTitle('w3', 'T', 'Words')))
    await recorded('w3', tick('w3', box))
    await settled()
    assert.equal(stage('w3'), 'unsaved')
    await recorded('w3', editTitle('w3', 'Words', 'Words'))
    await settled()
    assert.notEqual(stage('w3'), 'unsaved')
  })
  await clean('w3')
})

test('failed saves in a row run oldest first inside the next save, so it lands the newest words with no copy', async (t) => {
  const d = await db()
  await d.put('notes', {_id: 'w4', _type: 'note', title: 'T', _rev: 'r1', body: {blocks: [para('a', 'one')]}} as never)
  await failing(t, async () => {
    await inFailure(() => recorded('w4', editBody('w4', [para('a', 'one')], [para('a', 'two')])))
    await inFailure(() => recorded('w4', editBody('w4', [para('a', 'two')], [para('a', 'three')])))
    await recorded('w4', editBody('w4', [para('a', 'three')], [para('a', 'four')]))
    assert.deepEqual(bodyOf((await stored('w4')) as never), ['four'])
    assert.equal((await stored('w4')).conflicts?.length ?? 0, 0)
  })
  await clean('w4')
})

test('a delete that lands forgets what the note still owed: nothing unsaved, nothing counted, no words waiting for the id', async (t) => {
  const d = await db()
  await d.put('notes', {_id: 'w5', _type: 'note', title: 'T', _rev: 'r1', body: {blocks: [para('a', 'one')]}} as never)
  await failing(t, async () => {
    const before = (await unsyncedNow())!
    await inFailure(() => recorded('w5', editBody('w5', [para('a', 'one')], [para('a', 'stale')])))
    assert.equal(owesWords('w5'), true)
    await recorded('w5', deleteNote('w5'))
    await d.delete('outbox', 'w5')
    await settled()
    assert.equal(owesWords('w5'), false)
    assert.notEqual(stage('w5'), 'unsaved')
    assert.equal(journalOf('w5'), undefined)
    assert.equal(await unsyncedNow(), before)
  })
  await clean('w5')
})

test('a blank note whose title failed to write is not dropped as blank; its words land with the next save', async (t) => {
  const d = await db()
  await d.put('notes', {_id: 'w6', _type: 'note', title: '', notebook: {_ref: 'nb'}, tags: [], links: [], body: {blocks: [{id: 'p', type: 'paragraph'}]}} as never)
  await markMade('w6')
  await failing(t, async () => {
    await inFailure(() => recorded('w6', editTitle('w6', '', 'Only here')))
    await dropIfBlank('w6')
    assert.notEqual(await stored('w6'), undefined)
    await recorded('w6', editTitle('w6', 'Only here', 'Only here too'))
    assert.equal((await stored('w6')).title, 'Only here too')
  })
  await clean('w6')
})
