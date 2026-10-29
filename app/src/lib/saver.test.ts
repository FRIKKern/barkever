import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'

const device: Device = newDevice('A')
use(device)
const {markDirty, markSaved, savePoint, stage} = await import('./saver.ts')
const {db} = await import('../replica/db.ts')
const {notify} = await import('../replica/bus.ts')
const settled = () => new Promise((r) => setTimeout(r, 5))

test('nothing is Saved before the outbox has been read once', () => {
  assert.equal(stage('n0'), 'unsaved')
})

test('a save that lands while newer typing waits still says Saving', async () => {
  markDirty('n1')
  const first = savePoint('n1')
  markDirty('n1')
  markSaved('n1', first)
  await settled()
  assert.equal(stage('n1'), 'unsaved')
  markSaved('n1', savePoint('n1'))
  await settled()
  assert.equal(stage('n1'), 'saved')
})

test('Saved waits until the outbox lets the note go', async () => {
  const d = await db()
  await d.put('outbox', {id: 'n2', base: null, v: 1, at: 0} as never)
  markDirty('n2')
  markSaved('n2', savePoint('n2'))
  await settled()
  assert.equal(stage('n2'), 'unsaved')
  await d.delete('outbox', 'n2')
  notify({kind: 'remote', ids: ['n2']})
  await settled()
  assert.equal(stage('n2'), 'saved')
})

test('an outbox that cannot be read says so, without an unhandled rejection, and recovers on the next change', async (t) => {
  const outbox = device.stores.outbox
  const warn = t.mock.method(console, 'warn', () => {})
  const rejections: unknown[] = []
  const onRejection = (e: unknown) => rejections.push(e)
  process.on('unhandledRejection', onRejection)
  device.stores.outbox = {keys: () => { throw new Error('disk gone') }} as never
  notify({kind: 'local', ids: ['n3']})
  await settled()
  assert.equal(stage('n3'), 'unchecked')
  assert.equal(warn.mock.callCount(), 1)
  device.stores.outbox = outbox
  notify({kind: 'local', ids: ['n3']})
  await settled()
  process.off('unhandledRejection', onRejection)
  assert.equal(stage('n3'), 'saved')
  assert.deepEqual(rejections, [])
})
