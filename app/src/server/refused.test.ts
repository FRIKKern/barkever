import {test} from 'node:test'
import assert from 'node:assert/strict'
import {refusedForGood} from './refused.ts'

test('a star is dropped only when Barkpark refuses the value (400, 413, 422); every other status keeps it to retry', () => {
  for (const status of [400, 413, 422]) assert.equal(refusedForGood(status), true, String(status))
  for (const status of [200, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504]) assert.equal(refusedForGood(status), false, String(status))
})
