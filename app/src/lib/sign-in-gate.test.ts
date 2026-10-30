import {test} from 'node:test'
import assert from 'node:assert/strict'
import {needsSignIn} from './sign-in-gate.ts'

test('every page asks for sign-in, except the sign-in page itself', () => {
  for (const p of ['/', '/no-such-page', '/sign-out', '/sign-in/x', '/editor-files', '/editor-assets/x.js', '/sw.js']) assert.equal(needsSignIn(p), true, p)
  assert.equal(needsSignIn('/sign-in'), false)
})

test('a built file under /assets/ never asks for sign-in, so a missing one is a 404, not a sign-in page', () => {
  for (const p of ['/assets/index-0000.js', '/assets/deep/missing.css']) assert.equal(needsSignIn(p), false, p)
  for (const p of ['/assets', '/assetsx.js', '/x/assets/y.js']) assert.equal(needsSignIn(p), true, p)
})
