import {test} from 'node:test'
import assert from 'node:assert/strict'
import {collapse, mergeLocal, mergeNote} from './merge.ts'
import {keep} from './resolve.ts'
import {sign} from './sign.ts'
import type {Conflict} from '../lib/model.ts'
import type {NoteDoc as Note} from './note.ts'

const AT = '2026-10-29T12:00:00.000Z'
const nb = (id: string) => ({_type: 'reference', _ref: id})
const r0: Note = {_id: 'n1', _type: 'note', _rev: 'r0', title: 'Plan', notebook: nb('inbox'), tags: [], links: [], body: {blocks: []}}
const kept = (n: Note) => [n, ...(n.conflicts ?? [])]

test('two writers set different tags offline: after both sync, both sets survive', () => {
  const b = sign({...r0, tags: ['from-b']}, 'B')
  const r1 = {...b, _rev: 'r1'}
  const a = mergeLocal(r0, {tags: []}, {tags: ['from-a']}, AT, 'local-1', 'A', r0)
  const merged = mergeNote(r0, a, r1, AT, 'A')
  const r2 = {...sign(merged, 'A'), _rev: 'r2'}
  const onB = mergeNote(r1, r1, r2, AT, 'B')
  for (const n of [r2, onB]) {
    const sets = kept(n).map((v) => v.tags)
    assert.ok(sets.some((t) => t?.join() === 'from-a') && sets.some((t) => t?.join() === 'from-b'), JSON.stringify(sets))
  }
})

test('two writers move a note to different notebooks offline: both notebooks survive', () => {
  const r1 = {...sign({...r0, notebook: nb('work')}, 'B'), _rev: 'r1'}
  const a = mergeLocal(r0, {notebook: nb('inbox')}, {notebook: nb('home')}, AT, 'local-1', 'A', r0)
  const merged = mergeNote(r0, a, r1, AT, 'A')
  assert.deepEqual([merged.notebook?._ref, merged.conflicts?.map((c) => [c.by, c.clash, c.notebook?._ref])], ['home', [['B', ['notebook'], 'work']]])
})

test('a copy holds only the organizing parts it clashed on', () => {
  const r1 = {...sign({...r0, tags: ['from-b'], notebook: nb('work')}, 'B'), _rev: 'r1'}
  const a = mergeLocal(r0, {tags: []}, {tags: ['from-a']}, AT, 'local-1', 'A', r0)
  const [c] = mergeNote(r0, a, r1, AT, 'A').conflicts!
  assert.deepEqual([c.clash, c.tags, c.notebook], [['tags'], ['from-b'], undefined])
})

const copy = (key: string, at: string, part: Partial<Conflict>, clash: string[]): Conflict => ({_key: key, by: 'B', at, title: 'Plan', body: {blocks: []}, clash, ...part})

test('tags-only copies with different tags never collapse into one; equal ones do', () => {
  const [x, y, z] = [copy('k1', '1', {tags: ['x']}, ['tags']), copy('k2', '2', {tags: ['y']}, ['tags']), copy('k3', '3', {tags: ['x']}, ['tags'])]
  assert.deepEqual(collapse([x, y, z], r0).map((c) => c._key), ['k1', 'k2'])
  const [m, n] = [copy('k4', '4', {notebook: nb('work')}, ['notebook']), copy('k5', '5', {notebook: nb('home')}, ['notebook'])]
  assert.deepEqual(collapse([m, n], r0).map((c) => c._key), ['k4', 'k5'])
})

test('a tags copy the main already holds goes', () => {
  assert.deepEqual(collapse([copy('k1', '1', {tags: ['x']}, ['tags'])], {...r0, tags: ['x']}), [])
})

test('Keep this on a tags or notebook copy makes its tags or notebook the main', () => {
  const main = {...r0, conflicts: [copy('k1', '1', {tags: ['from-b']}, ['tags']), copy('k2', '2', {notebook: nb('work')}, ['notebook'])]}
  const tagged = keep(main, 'k1', main, AT, 'local-k', 'A')
  assert.deepEqual([tagged.tags, tagged.conflicts?.map((c) => c._key)], [['from-b'], ['k2']])
  const moved = keep(tagged, 'k2', tagged, AT, 'local-k2', 'A')
  assert.deepEqual([moved.notebook?._ref, moved.conflicts], ['work', []])
})

test('a clash with a side that has no tags field keeps "no tags" in the copy, and Keep this clears them', () => {
  const {tags: _, ...bare} = {...r0, tags: ['old']}
  const r1 = {...sign(bare, 'B'), _rev: 'r1'}
  const a = mergeLocal({...r0, tags: ['old']}, {tags: ['old']}, {tags: ['old', 'a']}, AT, 'local-1', 'A', {...r0, tags: ['old']})
  const merged = mergeNote({...r0, tags: ['old']}, a, r1, AT, 'A')
  assert.deepEqual(merged.conflicts?.map((c) => [c.clash, c.tags]), [[['tags'], []]])
  assert.deepEqual(keep(merged, merged.conflicts![0]._key, merged, AT, 'local-k', 'A').tags, [])
})
