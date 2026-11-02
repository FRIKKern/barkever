import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {toNote, type BpNote} from './note-docs.ts'
import {checked, editRequest, editable, newProblems, reason, rewrite, verdict, type Change, type Edited} from './ai-edit.ts'
import type {Block} from './model.ts'

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

const para = (id: string, value = id): Block => ({id, type: 'paragraph', content: [{type: 'text', value}]})
const deep = (id: string): Block => ({id, type: 'heading', level: 9, text: id})
const edited = (changes: Change[]): Edited => ({changes, citations: [], provider: 'claude', model: 'm', tokens: 1, costUsd: null, read: 1})

test('an error the edit adds is added; one the note already had is old', () => {
  const {added, old} = newProblems([para('a'), deep('h')], [para('a'), deep('h'), deep('k')])
  assert.deepEqual(added.map((e) => [e.code, e.path]), [['value_not_allowed', '/blocks/2/level']])
  assert.deepEqual(old.map((e) => e.path), ['/blocks/1/level'])
})

test('a block moved down keeps its old error old: places key by the nearest block id', () => {
  assert.deepEqual(newProblems([deep('h')], [para('z'), deep('h')]).added, [])
  const section = (level: number) => ({id: 's', type: 'section', blocks: [{type: 'heading', level, text: 'x'}]}) as unknown as Block
  assert.deepEqual(newProblems([section(9)], [para('z'), section(9)]).added, [])
  assert.deepEqual(newProblems([section(2)], [section(9)]).added.map((e) => e.path), ['/blocks/0/blocks/0/level'])
})

test('an id-less broken block keys by its whole path, and errors are counted, not matched', () => {
  const idless = {type: 'heading', level: 9, text: 'x'} as unknown as Block
  assert.deepEqual(newProblems([idless], [idless]).added, [])
  assert.deepEqual(newProblems([idless], [para('a'), idless]).added.map((e) => e.path), ['/blocks/1/level'])
  assert.deepEqual(newProblems([para('d'), para('d')], [para('d'), para('d'), para('d')]).added.map((e) => e.code), ['duplicate_block_id'])
})

test('an error the note has twice in one place stays old twice', () => {
  const dup = [para('d'), para('d'), para('d')]
  assert.deepEqual(newProblems(dup, dup), {added: [], old: newProblems([], dup).added})
  assert.equal(newProblems([], dup).added.length, 2)
})

test('the broken block itself is the place when it has an id, and a blank id is no place', () => {
  const pt = {id: 'pt', _type: 'block', children: []} as unknown as Block
  assert.deepEqual(newProblems([pt], [para('z'), pt]).added, [])
  const blank = {id: '', type: 'heading', level: 9, text: 'x'} as unknown as Block
  assert.deepEqual(newProblems([blank], [para('z'), blank]).added.map((e) => e.path), ['/blocks/1/level'])
})

test('an item added above a broken list item leaves its error old; a second broken item adds one', () => {
  const item = (value: string) => ({content: [{type: 'text', value}]})
  const broken = {...item('b'), checked: 'yes'}
  const list = (items: object[]) => ({id: 'l', type: 'list', ordered: false, items}) as unknown as Block
  assert.deepEqual(newProblems([list([item('a'), broken])], [list([item('new'), item('a'), broken])]).added, [])
  assert.equal(newProblems([list([item('a'), broken])], [list([broken, item('a'), broken])]).added.length, 1)
})

test('text typed before a broken inline node leaves its error old', () => {
  const p = (content: object[]) => ({id: 'p', type: 'paragraph', content}) as unknown as Block
  const untyped = {value: 'x'}
  const {added, old} = newProblems([p([{type: 'text', value: 'a'}, untyped])], [p([{type: 'text', value: 'new'}, {type: 'text', value: 'a'}, untyped])])
  assert.deepEqual([added, old.map((e) => [e.code, e.path])], [[], [['missing_required_field', '/blocks/0/content/2/type']]])
})

test('another code at the same place is added', () => {
  const after = {...deep('h'), level: true} as unknown as Block
  assert.deepEqual(newProblems([deep('h')], [after]).added.map((e) => [e.code, e.path]), [['wrong_field_type', '/blocks/0/level']])
})

test('a nested block with an id is followed when it moves to another section', () => {
  const section = (id: string, blocks: Block[]) => ({id, type: 'section', blocks}) as unknown as Block
  assert.deepEqual(newProblems([section('s1', [deep('k')]), section('s2', [])], [section('s1', []), section('s2', [deep('k')])]).added, [])
})

test('a fixed error is neither added nor old', () => {
  assert.deepEqual(newProblems([deep('h')], [para('h')]), {added: [], old: []})
})

test('added errors refuse the edit with their reason; old ones only warn, and the diff stays', () => {
  const reply = edited([{block: 'a', after: 'A.'}])
  const added = newProblems([], [deep('k')]).added
  assert.deepEqual(verdict({added, old: []}, reply), {reply: {error: 'The change would break this note: 9 is above 6 at /blocks/0/level'}, old: null})
  assert.deepEqual(verdict({added: [], old: added}, reply), {reply, old: '9 is above 6 at /blocks/0/level'})
  assert.deepEqual(verdict({added: [], old: []}, reply), {reply, old: null})
})

test('a reason names five problems and counts the rest', () => {
  const many = newProblems([], [1, 2, 3, 4, 5, 6, 7].map((n) => deep(`h${n}`))).added
  assert.equal(reason(many), [0, 1, 2, 3, 4].map((i) => `9 is above 6 at /blocks/${i}/level`).join('; ') + ' and 2 more')
  assert.match(reason(many.slice(0, 6)), / and 1 more$/)
  assert.equal(reason(many.slice(0, 5)), [0, 1, 2, 3, 4].map((i) => `9 is above 6 at /blocks/${i}/level`).join('; '))
})

test('a text edit on a broken note keeps its diff and names the old problem; a clean note names none', () => {
  const reply = edited([{block: 'a', after: 'Shorter.'}])
  assert.deepEqual(checked([para('a'), deep('h')], reply), {reply, old: '9 is above 6 at /blocks/1/level'})
  assert.deepEqual(checked([para('a')], reply), {reply, old: null})
  assert.deepEqual(checked([deep('h')], {error: 'boom'}), {reply: {error: 'boom'}, old: null})
  const fixable = {id: 'f', type: 'heading', level: 2, content: 5} as unknown as Block
  assert.match(checked([fixable], edited([])).old!, /^expected array/)
  assert.deepEqual(checked([fixable], edited([{block: 'f', after: 'Fixed.'}])).old, null)
})

test("every synthetic fixture note validates, so AI Edit warns on none of them", () => {
  const notes = readFileSync(new URL('../../../fixtures/notes.ndjson', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((d) => d._type === 'note').map((d) => toNote(d as BpNote))
  assert.ok(notes.length >= 50)
  for (const n of notes) assert.deepEqual(checked(n.blocks, edited([])), {reply: edited([]), old: null}, n.id)
})
