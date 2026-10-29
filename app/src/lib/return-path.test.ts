import {test} from 'node:test'
import assert from 'node:assert/strict'
import {returnPath} from './return-path.ts'

test('a path on this app is kept, search and all', () => {
  for (const p of ['/', '/?n=fx-note-01', '/?nb=fx-nb-projects&n=fx-note-00']) assert.equal(returnPath(p), p)
})

test('anything that could leave the app, or loop back to sign-in, goes home', () => {
  const bad = [undefined, 42, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/%2F%2Fevil.example', '/%5Cevil.example', '/a b', '/\u0000x', '/sign-in?redirect=%2F', '/sign-out']
  for (const p of bad) assert.equal(returnPath(p), '/', String(p))
})
