import {test} from 'node:test'
import assert from 'node:assert/strict'
import {content, fromServer, type NoteDoc} from './note.ts'

test('server drafts land under their published id with only known fields', () => {
  const doc = fromServer({_id: 'drafts.n1', _publishedId: 'n1', _type: 'note', _rev: 'r1', _draft: true, _createdAt: 'x', title: 'T', extra: 1})
  assert.deepEqual(doc, {_id: 'n1', _type: 'note', _rev: 'r1', _updatedAt: undefined, title: 'T'})
})

test('notebooks keep name and parent only', () => {
  const doc = fromServer({_id: 'nb1', _type: 'notebook', _rev: 'r2', name: 'Work', parent: {_ref: 'nb0'}, colour: 'x'})
  assert.deepEqual(doc, {_id: 'nb1', _type: 'notebook', _rev: 'r2', _updatedAt: undefined, name: 'Work', parent: {_ref: 'nb0'}})
})

test('content drops system fields', () => {
  const note: NoteDoc = {_id: 'n1', _type: 'note', _rev: 'r1', _updatedAt: 'now', title: 'T', tags: []}
  assert.deepEqual(content(note), {title: 'T', tags: []})
})
