import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {NO_NOTEBOOK, toNoteRows, UNTITLED, type BpNote, type BpNotebook} from './note-rows.ts'

test('names each note with its notebook', () => {
  const rows = toNoteRows(
    [{_id: 'n1', title: 'Kickoff', notebook: {_ref: 'nb-work'}}],
    [{_id: 'nb-work', name: 'Work'}],
  )
  assert.deepEqual(rows, [{id: 'n1', title: 'Kickoff', notebook: 'Work'}])
})

test('drafts resolve to the published id on both sides', () => {
  const rows = toNoteRows(
    [{_id: 'drafts.n1', title: 'Draft', notebook: {_ref: 'drafts.nb-1'}}],
    [{_id: 'drafts.nb-1', name: 'Inbox'}],
  )
  assert.deepEqual(rows, [{id: 'n1', title: 'Draft', notebook: 'Inbox'}])
})

test('missing title, missing ref and unknown notebook fall back', () => {
  const rows = toNoteRows(
    [{_id: 'a', title: '  '}, {_id: 'b', title: 'B', notebook: null}, {_id: 'c', title: 'C', notebook: {_ref: 'gone'}}],
    [],
  )
  assert.deepEqual(rows.map((r) => [r.title, r.notebook]), [[UNTITLED, NO_NOTEBOOK], ['B', NO_NOTEBOOK], ['C', NO_NOTEBOOK]])
})

test('keeps the order Barkpark gave', () => {
  const rows = toNoteRows([{_id: 'z', title: 'Z'}, {_id: 'a', title: 'A'}], [])
  assert.deepEqual(rows.map((r) => r.id), ['z', 'a'])
})

test('the 50 fixtures map to 50 rows, every one in a named notebook', () => {
  const docs = readFileSync(new URL('../../../fixtures/notes.ndjson', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const notes = docs.filter((d) => d._type === 'note') as BpNote[]
  const rows = toNoteRows(notes, docs.filter((d) => d._type === 'notebook') as BpNotebook[])
  assert.equal(rows.length, 50)
  assert.deepEqual(rows.map((r) => r.title), notes.map((n) => n.title))
  assert.ok(rows.every((r) => r.notebook !== NO_NOTEBOOK))
})
