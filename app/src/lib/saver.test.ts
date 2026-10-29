import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'

const device: Device = newDevice('A')
use(device)
const {markDirty, markSaved, savePoint, stage, unsynced} = await import('./saver.ts')
const {db} = await import('../replica/db.ts')
const {notify} = await import('../replica/bus.ts')
const settled = () => new Promise((r) => setTimeout(r, 5))
const entry = (id: string) => ({id, base: null, v: 1, at: 0}) as never

test('nothing is Saved before the outbox has been read once', () => {
  assert.equal(stage('n0'), 'queued')
  assert.equal(unsynced(), null)
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
