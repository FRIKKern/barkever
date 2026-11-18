import {test} from 'node:test'
import assert from 'node:assert/strict'
import {shelve} from './notebooks.ts'
import {rank, type Ask} from './palette.ts'
import type {Note} from './model.ts'

const note = (id: string, title: string, body: string, updatedAt: string, tags: string[] = []) =>
  ({id, title, tags, notebook: 'nb-w', blocks: [{id: `${id}-p`, type: 'paragraph', content: [{type: 'text', value: body}]}], links: [], updatedAt, rev: '', conflicts: [], gen: 0}) as Note

const notes = [
  note('plan', 'Garden plan', 'beds and paths', '2026-10-01'),
  note('sync', 'Weekly sync', 'talked about the garden shed', '2026-10-05', ['garden']),
  note('garden', 'Garden', 'seeds to buy', '2026-10-02', ['garden']),
  note('board', 'Board meeting', 'quarterly numbers', '2026-10-03', ['work']),
]
const shelf = shelve([
  {id: 'nb-g', name: 'Gardening', parent: null},
  {id: 'nb-w', name: 'Work', parent: null},
  {id: 'nb-wk', name: 'Weekly', parent: 'nb-w'},
])
const ask = (q: string, more: Partial<Ask> = {}): Ask => ({q, here: {}, notes, shelf, tags: [['garden', 2], ['work', 1]], recents: [], canNew: true, ...more})
const keys = (a: Ask) => rank(a).picks.map((p) => p.key)
const pick = (a: Ask, key: string) => rank(a).picks.find((p) => p.key === key)

test('one query ranks tags, notebooks and notes together: exact, then prefix, then body words, then a search of all notes', () => {
  assert.deepEqual(keys(ask('garden')), ['tag:garden', 'note:garden', 'notebook:nb-g', 'note:plan', 'note:sync', 'search'])
  assert.deepEqual(keys(ask('#gard')), ['notebook:nb-g', 'tag:garden', 'note:garden', 'note:plan', 'note:sync', 'search'])
  assert.deepEqual(keys(ask('shed')), ['note:sync', 'search'])
  assert.deepEqual(keys(ask('xyzzy')), ['search'])
})

test('commands match by their words, and only show when they can run', () => {
  assert.equal(keys(ask('new'))[0], 'new')
  assert.equal(keys(ask('new', {canNew: false}))[0], 'search')
  assert.deepEqual(keys(ask('board')), ['note:board', 'tasks', 'search'])
  assert.equal(keys(ask('todo'))[0], 'tasks')
  assert.equal(keys(ask('all notes'))[0], 'all')
  assert.ok(!keys(ask('rail')).includes('rail'))
  assert.equal(keys(ask('rail', {here: {n: 'plan'}}))[0], 'rail')
  assert.ok(!keys(ask('sign out')).some((k) => /sign|out/.test(k)))
})

test('an empty query shows recent notes first, then the commands', () => {
  assert.deepEqual(keys(ask('', {recents: ['sync', 'gone', 'plan']})), ['note:sync', 'note:plan', 'new', 'tasks', 'map', 'all'])
  assert.deepEqual(keys(ask('  ', {here: {n: 'plan'}})), ['new', 'tasks', 'map', 'all', 'rail'])
})

test('each pick names the search it opens: notes keep the scope, places replace it, actions have none', () => {
  const here = {nb: 'nb-w', n: 'board'}
  assert.deepEqual(pick(ask('garden plan', {here}), 'note:plan')?.to, {nb: 'nb-w', n: 'plan'})
  assert.deepEqual(pick(ask('garden', {here: {tag: 'work', q: 'x', view: 'tasks'}}), 'note:garden')?.to, {tag: 'work', n: 'garden'})
  assert.deepEqual(pick(ask('garden', {here}), 'notebook:nb-g')?.to, {nb: 'nb-g'})
  assert.deepEqual(pick(ask('weekly', {here}), 'notebook:nb-wk')?.detail, 'Work')
  assert.deepEqual(pick(ask('garden', {here}), 'tag:garden')?.to, {tag: 'garden'})
  assert.deepEqual(pick(ask(' garden shed ', {here}), 'search')?.to, {q: 'garden shed'})
  assert.deepEqual(pick(ask('tasks', {here}), 'tasks')?.to, {view: 'tasks'})
  assert.deepEqual(pick(ask('graph', {here}), 'map')?.to, {...here, view: 'map'})
  assert.deepEqual(pick(ask('map', {here: {n: 'plan', view: 'tasks'}}), 'map')?.to, {n: 'plan', view: 'map'})
  assert.deepEqual(pick(ask('all', {here}), 'all')?.to, {})
  assert.deepEqual(pick(ask('new', {here}), 'new'), {key: 'new', kind: 'command', label: 'New note', score: 10, act: 'new'})
  assert.deepEqual(pick(ask('rail', {here}), 'rail')?.act, 'rail')
})

test('the words to mark come from the note search, typos included', () => {
  assert.deepEqual(rank(ask('gardn')).marks, ['gardn', 'garden'])
})
