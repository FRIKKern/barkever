import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newDevice, use} from '../chaos/fake-db.ts'

use(newDevice('A'))
const {markDirty, markSaved, savePoint, unsaved} = await import('./saver.ts')
const {db} = await import('../replica/db.ts')
const {notify} = await import('../replica/bus.ts')
const settled = () => new Promise((r) => setTimeout(r, 5))

test('a save that lands while newer typing waits still says Saving', async () => {
  markDirty('n1')
  const first = savePoint('n1')
  markDirty('n1')
  markSaved('n1', first)
  await settled()
  assert.equal(unsaved('n1'), true)
  markSaved('n1', savePoint('n1'))
  await settled()
  assert.equal(unsaved('n1'), false)
})

test('Saved waits until the outbox lets the note go', async () => {
  const d = await db()
  await d.put('outbox', {id: 'n2', base: null, v: 1, at: 0} as never)
  markDirty('n2')
  markSaved('n2', savePoint('n2'))
  await settled()
  assert.equal(unsaved('n2'), true)
  await d.delete('outbox', 'n2')
  notify({kind: 'remote', ids: ['n2']})
  await settled()
  assert.equal(unsaved('n2'), false)
})

