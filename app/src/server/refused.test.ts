import {test} from 'node:test'
import assert from 'node:assert/strict'
import {refusedForGood} from './refused.ts'

test('a star Barkpark refuses for good is a 4xx that waiting cannot fix; auth, timeouts, rate limits and 5xx retry', () => {
  for (const status of [400, 404, 409, 413, 422]) assert.equal(refusedForGood(status), true, String(status))
  for (const status of [200, 401, 403, 408, 429, 500, 502, 503, 504]) assert.equal(refusedForGood(status), false, String(status))
})
