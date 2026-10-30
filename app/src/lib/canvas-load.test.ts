import {test} from 'node:test'
import assert from 'node:assert/strict'
import {atLeast} from './canvas-load.ts'

test('the editor contract must be 1.17.0 or newer', () => {
  assert.deepEqual(
    ['1.17.0', '1.17.1', '1.18.0', '2.0.0', '1.16.9', '1.9.0', '0.99.0', '', undefined].map((v) => atLeast(v, '1.17.0')),
    [true, true, true, true, false, false, false, false, false],
  )
})
