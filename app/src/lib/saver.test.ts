import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'

const device: Device = newDevice('A')
use(device)
const {markDirty, markSaved, savePoint, stage, unsynced, unsyncedNow, writeFailed} = await import('./saver.ts')
const {db} = await import('../replica/db.ts')
const {notify} = await import('../replica/bus.ts')
const {editBody, editTitle} = await import('../replica/local.ts')
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

test('sign-out counts words only the journal holds, and answers null when the outbox cannot be read', async () => {
  const before = (await unsyncedNow())!
  jot('j1', {title: 'held'})
  assert.equal(await unsyncedNow(), before + 1)
  forgetJournal()
  const outbox = device.stores.outbox
  device.stores.outbox = {keys: () => { throw new Error('disk gone') }} as never
  assert.equal(await unsyncedNow(), null)
  device.stores.outbox = outbox
})

test('a write that fails shows as unsaved and counts as unsynced until a later save of that note lands, with no unhandled rejection', async (t) => {
  const d = await db()
  await d.put('notes', {_id: 'w1', _type: 'note', title: 'Before', _rev: 'r1'} as never)
  const notes = device.stores.notes
  const warn = t.mock.method(console, 'warn', () => {})
  const rejections: unknown[] = []
  const onRejection = (e: unknown) => rejections.push(e)
  process.on('unhandledRejection', onRejection)
  const before = (await unsyncedNow())!
  const broken = new Map(notes)
  broken.set = () => { throw new Error('quota') }
  device.stores.notes = broken
  markDirty('w1', 'title')
  await editTitle('w1', 'Before', 'After').then(() => markSaved('w1', 'title', savePoint('w1', 'title')), writeFailed('w1'))
  await settled()
  assert.equal(stage('w1'), 'unsaved')
  assert.equal(warn.mock.callCount(), 1)
  assert.equal(await unsyncedNow(), before + 1)
  notify({kind: 'remote', ids: ['w1']})
  await settled()
  assert.equal(stage('w1'), 'unsaved')
  device.stores.notes = notes
  await editTitle('w1', 'After', 'After again').then(() => markSaved('w1', 'title', savePoint('w1', 'title')), writeFailed('w1'))
  await settled()
  process.off('unhandledRejection', onRejection)
  assert.equal(stage('w1'), 'queued')
  assert.deepEqual(rejections, [])
  await d.delete('outbox', 'w1')
  forgetJournal()
  notify({kind: 'local', ids: ['w1']})
  await settled()
})

test('a failed title write outlives a body save: still unsaved, still in the journal, until a title save lands', async (t) => {
  const d = await db()
  const para = (id: string, value: string) => ({id, type: 'paragraph', content: [{type: 'text', value}]})
  await d.put('notes', {_id: 'w2', _type: 'note', title: 'Before', _rev: 'r1', body: {blocks: [para('a', 'one')]}} as never)
  const notes = device.stores.notes
  t.mock.method(console, 'warn', () => {})
  const broken = new Map(notes)
  broken.set = () => { throw new Error('quota') }
  device.stores.notes = broken
  markDirty('w2', 'title')
  await editTitle('w2', 'Before', 'Lost?').catch(writeFailed('w2', 'title'))
  device.stores.notes = notes
  await editBody('w2', [para('a', 'one')], [para('a', 'one two')])
  markSaved('w2', 'body', undefined)
  await settled()
  assert.equal(stage('w2'), 'unsaved')
  assert.equal(jotted().find(([id]) => id === 'w2')?.[1].title, 'Lost?')
  await editTitle('w2', 'Before', 'Found').then(() => markSaved('w2', 'title', savePoint('w2', 'title')))
  await settled()
  assert.notEqual(stage('w2'), 'unsaved')
  assert.equal(jotted().find(([id]) => id === 'w2'), undefined)
  await d.delete('outbox', 'w2')
  notify({kind: 'local', ids: ['w2']})
  await settled()
})
