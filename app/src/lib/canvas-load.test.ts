import {test} from 'node:test'
import assert from 'node:assert/strict'
import {atLeast} from './canvas-load.ts'

test('the editor contract must be 1.20.0 or newer', () => {
  assert.deepEqual(
    ['1.20.0', '1.20.1', '1.21.0', '2.0.0', '1.19.9', '1.2.0', '0.99.0', '', undefined].map((v) => atLeast(v, '1.20.0')),
    [true, true, true, true, false, false, false, false, false],
  )
})
