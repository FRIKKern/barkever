import {test} from 'node:test'
import assert from 'node:assert/strict'
import {inHeldOrder} from './held-order.ts'

const row = (id: string, title = id) => ({id, title})

test('a re-sort while held keeps every row where it was, with its new words', () => {
  const held = [row('a'), row('b'), row('c')]
  const now = [row('c', 'c moved up'), row('a'), row('b')]
  assert.deepEqual(inHeldOrder(held, now), [row('a'), row('b'), row('c', 'c moved up')])
})

test('a note that arrives while held goes below the held rows, so nothing above the pointer moves', () => {
  assert.deepEqual(inHeldOrder([row('a'), row('b')], [row('new'), row('a'), row('b')]).map((r) => r.id), ['a', 'b', 'new'])
})

test('a note removed while held keeps its place until the release', () => {
  assert.deepEqual(inHeldOrder([row('a'), row('b'), row('c')], [row('a'), row('c')]).map((r) => r.id), ['a', 'b', 'c'])
})
