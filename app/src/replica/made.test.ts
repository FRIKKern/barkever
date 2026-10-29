import {test} from 'node:test'
import assert from 'node:assert/strict'
import {empty, touchedByOthers} from './made.ts'
import {sign} from './sign.ts'
import type {NoteDoc as Note} from './note.ts'

const AT = '2026-10-29T12:00:00.000Z'
const synced: Note = {_id: 'n1', _type: 'note', _rev: 'r2', title: '', tags: ['kept'], links: [], body: {blocks: [{id: 'p0', type: 'paragraph', content: []}]}}

test('a note with no title, no text and no kept version is empty, whatever its tags', () => {
  assert.equal(empty(synced), true)
})

test('a note with text, or with a kept version, is not empty', () => {
  assert.equal(empty({...synced, title: 'x'}), false)
  assert.equal(empty({...synced, body: {blocks: [{id: 'p0', type: 'paragraph', content: [{type: 'text', value: 'x'}]}]}}), false)
  assert.equal(empty({...synced, conflicts: [{_key: 'r1', by: 'B', at: AT, title: 'B typed this', clash: ['title']}]}), false)
})

test('my own version landing keeps the made-here mark; anyone else’s, or a raw write, clears it', () => {
  assert.equal(touchedByOthers({...sign(synced, 'A'), _rev: 'r3'}, 'A'), false)
  assert.equal(touchedByOthers({...sign(synced, 'B'), _rev: 'r3'}, 'A'), true)
  assert.equal(touchedByOthers({...sign(synced, 'A'), title: 'raw'}, 'A'), true)
  assert.equal(touchedByOthers(null, 'A'), false)
})
