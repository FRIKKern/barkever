import {test} from 'node:test'
import assert from 'node:assert/strict'
import {replicaName} from './db.ts'

test('each account and dataset gets its own replica, and the name does not spell the email', async () => {
  const a = await replicaName('ada@example.test', 'production')
  assert.equal(a, await replicaName('ada@example.test', 'production'))
  assert.notEqual(a, await replicaName('bob@example.test', 'production'))
  assert.notEqual(a, await replicaName('ada@example.test', 'fixtures'))
  assert.notEqual(a, await replicaName(null, 'production'))
  assert.match(a, /^barkever-[0-9a-f]{24}$/)
  assert.ok(!a.includes('ada'))
})
