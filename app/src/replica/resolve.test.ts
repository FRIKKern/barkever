import {test} from 'node:test'
import assert from 'node:assert/strict'
import {collapse, mergeNote} from './merge.ts'
import {dismiss, keep} from './resolve.ts'
import {blockText, type Block, type Conflict} from '../lib/model.ts'
import {groups} from '../lib/versions.ts'
import type {NoteDoc as Note} from './note.ts'

const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const at = (s: number) => new Date(Date.parse('2026-10-29T12:00:00.000Z') + s * 1000).toISOString()
const copy = (key: string, s: number, by: string, clash: string[], title: string, blocks: Block[]): Conflict => ({_key: key, by, at: at(s), title, body: {blocks}, clash})
const texts = (n: Note) => n.body!.blocks.map((b) => `${b.id}:${blockText(b)}`)
const main: Note = {_id: 'n', _type: 'note', _rev: 'r5', title: 'Main', tags: [], links: [], body: {blocks: [p('a', 'one'), p('b', 'two')]}}

test('identical copies collapse to the earliest, and a copy the main already shows goes', () => {
  const k1 = copy('k1', 1, 'A', ['body:a'], 'x', [p('a', 'A text')])
  const k2 = copy('k2', 2, 'B', ['body:a'], 'y', [p('a', 'A text')])
  const k3 = copy('k3', 3, 'A', ['body:a'], 'Main', [p('a', 'one')])
  const k4 = copy('k4', 4, 'A', ['title', 'body:a'], 'Main', [p('a', 'one!')])
  assert.deepEqual(collapse([k2, k1, k3, k4], main).map((c) => c._key), ['k1', 'k4'])
})

test('Keep this puts the copy’s clashing parts in the main and removes only that copy', () => {
  const k1 = copy('k1', 1, 'A', ['title', 'body:b'], 'A title', [p('a', 'ignored'), p('b', 'A two'), p('c', 'not clashing')])
  const k2 = copy('k2', 2, 'B', ['body:a'], 'Main', [p('a', 'B one')])
  const out = keep({...main, conflicts: [k1, k2]}, 'k1')
  assert.equal(out.title, 'A title')
  assert.deepEqual(texts(out), ['a:one', 'b:A two'])
  assert.deepEqual(out.conflicts?.map((c) => c._key), ['k2'])
})

test('Keep this brings back a block the copy holds and drops one it deleted', () => {
  const back = copy('k1', 1, 'A', ['body:n'], 'Main', [p('a', 'one'), p('n', 'new in A'), p('b', 'two')])
  assert.deepEqual(texts(keep({...main, conflicts: [back]}, 'k1')), ['a:one', 'n:new in A', 'b:two'])
  const gone = copy('k2', 1, 'A', ['body:b'], 'Main', [p('a', 'one')])
  assert.deepEqual(texts(keep({...main, conflicts: [gone]}, 'k2')), ['a:one'])
})

test('Keep this folds other copies of the same text into the new main', () => {
  const k1 = copy('k1', 1, 'A', ['body:a'], 'Main', [p('a', 'same')])
  const k2 = copy('k2', 2, 'B', ['body:a'], 'Main', [p('a', 'same')])
  const out = keep({...main, conflicts: [k1, k2]}, 'k2')
  assert.deepEqual(texts(out), ['a:same', 'b:two'])
  assert.deepEqual(out.conflicts, [])
})

test('Dismiss removes one copy, and the removal wins a merge with a device that still holds it', () => {
  const k1 = copy('k1', 1, 'A', ['body:a'], 'Main', [p('a', 'A one')])
  const k2 = copy('k2', 2, 'B', ['body:a'], 'Main', [p('a', 'B one')])
  const base = {...main, conflicts: [k1, k2]}
  const mine = dismiss(base, 'k1')
  assert.deepEqual(mine.conflicts?.map((c) => c._key), ['k2'])
  const theirs = {...base, _rev: 'r6', title: 'Renamed elsewhere'}
  const out = mergeNote(base, mine, theirs, at(9), 'me')
  assert.equal(out.title, 'Renamed elsewhere')
  assert.deepEqual(out.conflicts?.map((c) => c._key), ['k2'])
})

test('versions group by writer and parts, newest first, the rest folded', () => {
  const g = groups([
    copy('k1', 1, 'A', ['body:a'], 'T', [p('a', 'A1')]),
    copy('k2', 2, 'B', ['body:a'], 'T', [p('a', 'B1')]),
    copy('k3', 3, 'A', ['body:a'], 'T', [p('a', 'A2')]),
    copy('k4', 4, 'A', ['title'], 'A title', []),
  ])
  assert.deepEqual(g.map((x) => [x.latest._key, x.earlier.map((c) => c._key)]), [['k4', []], ['k3', ['k1']], ['k2', []]])
  const joined = groups([copy('k5', 5, 'A', ['title', 'body:a'], 'A both', [p('a', 'A3')]), ...g.flatMap((x) => [x.latest, ...x.earlier])])
  assert.deepEqual(joined.map((x) => [x.latest._key, x.earlier.map((c) => c._key)]), [['k5', ['k4', 'k3', 'k1']], ['k2', []]])
})
