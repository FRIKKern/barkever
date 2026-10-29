import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {mergeBlocks, mergeNote, reconcile, same} from './merge.ts'
import {sign} from './sign.ts'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc as Note} from './note.ts'

const AT = '2026-10-29T12:00:00.000Z'
const ME = 'dev-me'
const note = (blocks: Block[], extra: Partial<Note> = {}): Note => ({_id: 'n1', _type: 'note', title: 'Plan', tags: [], links: [], body: {blocks}, ...extra})
const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const withText = (b: Block, text: string): Block => (b.type === 'heading' ? {...b, text} : {...b, content: [{type: 'text', value: text}]})
const texts = (n: Note | null) => n?.body?.blocks.map((b) => `${b.id}:${blockText(b)}`)
const base = note([p('a', 'one'), p('b', 'two'), p('c', 'three')], {_rev: 'r0'})

test('same ignores key order and empty keys, and Barkpark storing an empty title as null', () => {
  assert.ok(same({a: 1, b: [{x: 1, y: 2}]}, {b: [{y: 2, x: 1}], a: 1, c: undefined}))
  assert.ok(same({title: ''}, {title: null}))
  assert.ok(!same({title: ''}, {title: 'x'}))
  assert.ok(!same({a: 1}, {a: 2}))
  assert.ok(!same([1, 2], [2, 1]))
})

test('edits to different fields and blocks both land, no conflict', () => {
  const mine = {...base, title: 'Plan B'}
  const theirs = {...base, _rev: 'r1', body: {blocks: [p('a', 'one'), p('b', 'TWO'), p('c', 'three')]}}
  const out = mergeNote(base, mine, theirs, AT, ME)
  assert.equal(out.title, 'Plan B')
  assert.deepEqual(texts(out), ['a:one', 'b:TWO', 'c:three'])
  assert.equal(out.conflicts, undefined)
})

test('same block changed both sides keeps mine in place and theirs as a conflict copy', () => {
  const mine = {...base, body: {blocks: [p('a', 'one'), p('b', 'mine'), p('c', 'three')]}}
  const theirs = {...base, _rev: 'r1', body: {blocks: [p('a', 'one'), p('b', 'theirs'), p('c', 'three')]}}
  const out = mergeNote(base, mine, theirs, AT, ME)
  assert.deepEqual(texts(out), ['a:one', 'b:mine', 'c:three'])
  assert.equal(out.conflicts?.length, 1)
  const [c] = out.conflicts!
  assert.deepEqual([c._key.split('~')[0], c.at, c.clash, c.title], ['r1', AT, ['body:b'], 'Plan'])
  assert.deepEqual(texts({...theirs, body: c.body}), ['a:one', 'b:theirs', 'c:three'])
})

test('same title changed both sides is a title clash', () => {
  const out = mergeNote(base, {...base, title: 'Mine'}, {...base, _rev: 'r1', title: 'Theirs'}, AT, ME)
  assert.equal(out.title, 'Mine')
  assert.deepEqual(out.conflicts?.map((c) => [c.title, c.clash]), [['Theirs', ['title']]])
})

test('the same change on both sides is no conflict', () => {
  const edit = {...base, title: 'Same', body: {blocks: [p('a', 'one'), p('b', 'both'), p('c', 'three')]}}
  const out = mergeNote(base, edit, {...edit, _rev: 'r1'}, AT, ME)
  assert.equal(out.title, 'Same')
  assert.deepEqual(texts(out), ['a:one', 'b:both', 'c:three'])
  assert.equal(out.conflicts, undefined)
})

test('a block I deleted that they edited comes back, with no copy of text the note already shows', () => {
  const mine = {...base, body: {blocks: [p('a', 'one'), p('c', 'three')]}}
  const theirs = {...base, _rev: 'r1', body: {blocks: [p('a', 'one'), p('b', 'two!'), p('c', 'three')]}}
  const out = mergeNote(base, mine, theirs, AT, ME)
  assert.deepEqual(texts(out), ['a:one', 'b:two!', 'c:three'])
  assert.equal(out.conflicts, undefined)
})

test('a block deleted on one side and untouched on the other is gone', () => {
  const r = mergeBlocks(base.body!.blocks, [p('a', 'one'), p('c', 'three')], base.body!.blocks)
  assert.deepEqual(r.blocks.map((b) => b.id), ['a', 'c'])
  assert.deepEqual(r.clash, [])
})

test('blocks added on both sides keep their places', () => {
  const r = mergeBlocks(base.body!.blocks, [p('a', 'one'), p('m', 'mine new'), p('b', 'two'), p('c', 'three')], [...base.body!.blocks, p('t', 'theirs new')])
  assert.deepEqual(r.blocks.map((b) => b.id), ['a', 'm', 'b', 'c', 't'])
  assert.deepEqual(r.clash, [])
})

test('their reorder survives my text edit', () => {
  const r = mergeBlocks(base.body!.blocks, [p('a', 'ONE'), p('b', 'two'), p('c', 'three')], [p('c', 'three'), p('a', 'one'), p('b', 'two')])
  assert.deepEqual(r.blocks.map((b) => `${b.id}:${blockText(b)}`), ['c:three', 'a:ONE', 'b:two'])
})

test('my reorder wins over their unmoved order and keeps their text edit', () => {
  const r = mergeBlocks(base.body!.blocks, [p('b', 'two'), p('a', 'one'), p('c', 'three')], [p('a', 'one'), p('b', 'two'), p('c', 'THREE')])
  assert.deepEqual(r.blocks.map((b) => `${b.id}:${blockText(b)}`), ['b:two', 'a:one', 'c:THREE'])
})

test('reconcile: their delete wins over my untouched copy, loses to my edit', () => {
  assert.equal(reconcile(base, {...base}, null, AT, ME), null)
  assert.equal(reconcile(base, {...base, title: 'kept'}, null, AT, ME)?.title, 'kept')
  assert.equal(reconcile(null, {...base, title: 'new here'}, null, AT, ME)?.title, 'new here')
})

test('reconcile: my delete wins over their untouched copy, loses to their edit', () => {
  assert.equal(reconcile(base, null, {...base, _rev: 'r1'}, AT, ME), null)
  assert.equal(reconcile(base, null, {...base, _rev: 'r1', title: 'theirs'}, AT, ME)?.title, 'theirs')
})

test('reconcile without a base: equal blocks merge, differing ones clash', () => {
  const mine = note([p('a', 'one'), p('b', 'mine')])
  const theirs = note([p('a', 'one'), p('b', 'theirs')], {_rev: 'r9'})
  const out = reconcile(null, mine, theirs, AT, ME)!
  assert.deepEqual(texts(out), ['a:one', 'b:mine'])
  assert.deepEqual(out.conflicts?.map((c) => [c._key.split('~')[0], c.clash]), [['r9', ['body:b']]])
})

test('conflict copies merge by key: one side resolving removes it, both adding keeps one', () => {
  const c1 = {_key: 'k1', at: AT, title: 'x', clash: ['title']}
  const c2 = {_key: 'k2', at: AT, title: 'y', clash: ['title']}
  const b = {...base, conflicts: [c1]}
  const out = mergeNote(b, {...b, conflicts: [c2]}, {...b, _rev: 'r1', conflicts: [c1, c2]}, AT, ME)
  assert.deepEqual(out.conflicts?.map((c) => c._key), ['k2'])
})

test('a three-way chain keeps every version: server, then A, then B', () => {
  const server = {...base, _rev: 'rS', body: {blocks: [p('a', 'one'), p('b', 'server'), p('c', 'three')]}}
  const aLocal = {...base, body: {blocks: [p('a', 'one'), p('b', 'A'), p('c', 'three')]}}
  const bLocal = {...base, body: {blocks: [p('a', 'one'), p('b', 'B'), p('c', 'three')]}}
  const aMerged = {...sign(mergeNote(base, aLocal, server, AT, 'A'), 'A'), _rev: 'rA'}
  const bMerged = mergeNote(base, bLocal, server, AT, 'B')
  const final = mergeNote(server, bMerged, aMerged, AT, 'B')
  const kept = [final, ...final.conflicts!.map((c) => ({...final, body: c.body}))].map((n) => blockText(n.body!.blocks[1]))
  assert.deepEqual(kept, ['B', 'server', 'A'])
  assert.equal(new Set(final.conflicts!.map((c) => c._key)).size, final.conflicts!.length)
})

test('merging twice gives the same note', () => {
  const mine = {...base, title: 'Mine', body: {blocks: [p('a', 'mine'), p('b', 'two'), p('c', 'three')]}}
  const theirs = {...base, _rev: 'r1', title: 'Theirs', body: {blocks: [p('a', 'theirs'), p('b', 'two'), p('c', 'three')]}}
  const once = mergeNote(base, mine, theirs, AT, ME)
  assert.deepEqual(mergeNote(theirs, once, theirs, AT, ME), once)
})

test('a real fixture note merges an edit to its paragraph with a new title from elsewhere', () => {
  const docs = readFileSync(new URL('../../../fixtures/notes.ndjson', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const fx: Note = docs.find((d) => d._id === 'fx-note-00')
  const blocks = fx.body!.blocks
  const mine = {...fx, body: {blocks: blocks.map((b, i) => (i === 1 ? withText(b, 'Edited offline') : b))}}
  const out = mergeNote(fx, mine, {...fx, _rev: 'r1', title: 'Harbor: kickoff (moved)'}, AT, ME)
  assert.equal(out.title, 'Harbor: kickoff (moved)')
  assert.equal(blockText(out.body!.blocks[1]), 'Edited offline')
  assert.deepEqual(out.body!.blocks.slice(2), blocks.slice(2))
  assert.equal(out.conflicts, undefined)
})
