import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {toNote, type BpNote} from './note-docs.ts'
import {editRequest, editable, rewrite} from './ai-edit.ts'

const kickoff = readFileSync(new URL('../../../fixtures/notes.ndjson', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((d) => d._id === 'fx-note-00').map((d) => toNote(d as BpNote))[0]
const sitemap = readFileSync(new URL('../../../fixtures/notes.ndjson', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((d) => d._id === 'fx-note-01').map((d) => toNote(d as BpNote))[0]

test('AI Edit sends only the selected plain blocks, in note order, and never a block with a link or a list', () => {
  assert.deepEqual(editable(kickoff.blocks, ['fx-note-00-p1', 'fx-note-00-t', 'fx-note-00-p0', 'fx-note-00-h']), [
    {id: 'fx-note-00-h', text: 'Summary'},
    {id: 'fx-note-00-p0', text: 'Goals for the Harbor site redesign: faster pages, calmer navigation, one clear call to action.'},
    {id: 'fx-note-00-p1', text: 'Owner: Ola Testesen. Deadline end of quarter.'},
  ])
  assert.deepEqual(editable(sitemap.blocks, ['fx-note-01-l']), [])
})

test('the request carries the note as its one source', () => {
  const req = editRequest(kickoff, 'Tighten this', editable(kickoff.blocks, ['fx-note-00-p1']))
  assert.deepEqual(req.note, {id: 'fx-note-00', title: 'Harbor redesign: kickoff'})
  assert.deepEqual(req.notes.map((n) => n.id), ['fx-note-00'])
})

test('a rewrite changes that one block and leaves every other block the same object', () => {
  const next = rewrite(kickoff.blocks, {block: 'fx-note-00-p1', after: 'Owner: Ola. Due end of quarter.'})
  assert.deepEqual(next.find((b) => b.id === 'fx-note-00-p1')!.content, [{type: 'text', value: 'Owner: Ola. Due end of quarter.'}])
  next.forEach((b, i) => b.id !== 'fx-note-00-p1' && assert.equal(b, kickoff.blocks[i]))
  assert.equal(rewrite(kickoff.blocks, {block: 'fx-note-00-h', after: 'Short summary'}).find((b) => b.id === 'fx-note-00-h')!.text, 'Short summary')
})
