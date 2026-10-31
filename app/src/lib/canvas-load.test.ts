import {test} from 'node:test'
import assert from 'node:assert/strict'
import {atLeast, retryIn} from './canvas-load.ts'

test('the editor contract must be 1.20.0 or newer', () => {
  assert.deepEqual(
    ['1.20.0', '1.20.1', '1.21.0', '2.0.0', '1.19.9', '1.2.0', '0.99.0', '', undefined].map((v) => atLeast(v, '1.20.0')),
    [true, true, true, true, false, false, false, false, false],
  )
})

test('a failed editor load tries again after 2 s, then twice as long each time, never more than a minute', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 40].map(retryIn), [2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000])
})
