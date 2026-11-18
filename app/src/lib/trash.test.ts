import {test} from 'node:test'
import assert from 'node:assert/strict'
import {leaveNote, listOf, parseSearch, sameList, scopeName} from './scope.ts'
import {emptyAsk, foreverAsk, linkedFrom, newestTrashed, split, withFresh} from './trash.ts'
import {toNote} from './note-docs.ts'
import type {Note} from './model.ts'

const note = (id: string, more: Partial<Note> = {}) => ({id, title: id, notebook: null, tags: [], blocks: [], links: [], updatedAt: '', rev: '', conflicts: [], gen: 0, ...more}) as Note
const ids = (notes: Note[]) => notes.map((n) => n.id)
const shelf = {byId: new Map()} as never

test('view=trash is a scope of its own, named Trash, and Back-able like the others', () => {
  assert.equal(parseSearch({view: 'trash'}).view, 'trash')
  assert.equal(parseSearch({view: 'bin'}).view, undefined)
  assert.equal(scopeName({view: 'trash'}, shelf), 'Trash')
})

test('opening a note from Trash stays in Trash; opening one from Tasks still leaves Tasks', () => {
  assert.equal(leaveNote({search: {view: 'trash'}, next: (s) => ({...s, n: 'a'})}).view, 'trash')
  assert.equal(leaveNote({search: {view: 'trash', n: 'a'}, next: (s) => ({...s, n: 'b'})}).view, 'trash')
  assert.equal(leaveNote({search: {view: 'tasks'}, next: (s) => ({...s, n: 'a'})}).view, undefined)
  assert.equal(leaveNote({search: {view: 'trash', n: 'a'}, next: () => ({n: 'a'})}).view, undefined)
})

test('a trashed note is only in trash: never in the notes every list, count, search, link and map reads', () => {
  const all = [note('a'), toNote({_id: 'b', trashed: '2026-11-18T10:00:00.000Z'}), note('c')]
  const {notes, trash} = split(all)
  assert.deepEqual(ids(notes), ['a', 'c'])
  assert.deepEqual(ids(trash), ['b'])
  assert.equal(toNote({_id: 'x'}).trashed, undefined)
})

test('a refresh moves a note between notes and trash as it is trashed and restored', () => {
  const lib = {notes: [note('a'), note('b')], trash: [note('c', {trashed: 't1'})]}
  const trashed = withFresh(lib, [note('a', {trashed: 't2'})], ['a'])
  assert.deepEqual([ids(trashed.notes), ids(trashed.trash)], [['b'], ['a', 'c']])
  const back = withFresh(trashed, [note('c')], ['c'])
  assert.deepEqual([ids(back.notes), ids(back.trash)], [['c', 'b'], ['a']])
  assert.deepEqual(ids(withFresh(back, [], ['a']).trash), [])
})

test('trash lists the latest trashed first', () => {
  const trash = [note('a', {trashed: '2026-11-17T09:00:00.000Z'}), note('b', {trashed: '2026-11-18T09:00:00.000Z'}), note('c', {trashed: '2026-11-16T09:00:00.000Z'})]
  assert.deepEqual(ids(newestTrashed(trash)), ['b', 'a', 'c'])
})

test('delete forever names the note and warns about notes that still link to it', () => {
  const target = note('t', {title: 'Harbor'})
  const live = [note('a', {links: ['t']}), note('b', {blocks: [{id: 'p', type: 'paragraph', content: [{type: 'wikilink', docId: 't'}]}]}), note('c'), note('t', {links: ['t']})]
  assert.equal(linkedFrom(live, ['t']), 2)
  assert.equal(linkedFrom(live, ['t', 'a']), 1)
  assert.equal(foreverAsk(target, 2), 'Delete “Harbor” forever? 2 notes link here; their links will show as gone. This can’t be undone.')
  assert.equal(foreverAsk(note('u', {title: ''}), 0), 'Delete “Untitled” forever? This can’t be undone.')
  assert.equal(emptyAsk(1, 0), 'Delete 1 note in Trash forever? This can’t be undone.')
  assert.equal(emptyAsk(3, 1), 'Delete 3 notes in Trash forever? 1 note links into Trash; their links will show as gone. This can’t be undone.')
})

test('Back from a trashed note opened by a link returns to Trash; Back from a note opened on the board still returns to the board', () => {
  assert.deepEqual(listOf({view: 'trash', n: 'a'}), {nb: undefined, tag: undefined, q: undefined, view: 'trash'})
  assert.deepEqual(listOf({view: 'tasks', n: 'a', nb: 'w'}), {nb: 'w', tag: undefined, q: undefined})
  assert.equal(sameList({view: 'trash'}, {view: 'trash', n: 'a'}), true)
  assert.equal(sameList({}, {view: 'trash', n: 'a'}), false)
  assert.equal(sameList({view: 'tasks'}, {n: 'a'}), true)
})
