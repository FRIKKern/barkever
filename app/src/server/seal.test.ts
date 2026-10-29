import {test} from 'node:test'
import assert from 'node:assert/strict'
import {seal, unseal} from './seal.ts'

const SECRET = 'a'.repeat(32)
const data = {email: 'ada@example.com', token: 'fake-session-token', exp: 1}

test('a sealed session opens with its secret and shows nothing of itself', () => {
  const sealed = seal(data, SECRET)
  assert.deepEqual(unseal(sealed, SECRET), data)
  assert.ok(!sealed.includes('fake-session-token') && !sealed.includes('ada@'))
  assert.notEqual(seal(data, SECRET), sealed)
})

test('another secret, one changed byte or a foreign cookie opens to nothing', () => {
  const sealed = seal(data, SECRET)
  assert.equal(unseal(sealed, 'b'.repeat(32)), undefined)
  const [v, iv, body, tag] = sealed.split('.')
  const bytes = Buffer.from(body, 'base64url')
  bytes[0] ^= 1
  assert.equal(unseal([v, iv, bytes.toString('base64url'), tag].join('.'), SECRET), undefined)
  for (const junk of ['', 'v1', 'v2.a.b.c', 'eyJ0b2tlbiI6IngifQ']) assert.equal(unseal(junk, SECRET), undefined)
})
