import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {board, lineKey, lineOf} from './board.ts'
import {toNote, toNotebook, type BpNote, type BpNotebook} from './note-docs.ts'
import {indexLinks} from './links.ts'
import {blockText, type Block, type Item, type Note, type Notebook} from './model.ts'
import {shelve} from './notebooks.ts'
import {find} from './search.ts'

const docs = readFileSync(new URL('../../../fixtures/notes.ndjson', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const notes = docs.filter((d) => d._type === 'note').map((d) => toNote(d as BpNote))
const notebooks = docs.filter((d) => d._type === 'notebook').map((d) => toNotebook(d as BpNotebook))
const shelf = shelve(notebooks)
const title = indexLinks({notes, notebooks}).title

const nb = (id: string, parent: string | null = null): Notebook => ({id, name: id.toUpperCase(), parent})
const note = (id: string, blocks: Block[], extra: Partial<Note> = {}): Note => ({id, title: id, notebook: 'a', tags: [], blocks, links: [], updatedAt: '2026-10-01T00:00:00Z', rev: '', conflicts: [], gen: 0, ...extra})
const text = (value: string) => [{type: 'text', value}]
const checklist = (id: string, items: Item[]): Block => ({id, type: 'list', task: true, items})
const lines = (b: ReturnType<typeof board>) => b.columns.flatMap((c) => c.cards.flatMap((card) => card.tasks.map((t) => `${card.note} ${t.line} ${t.depth} ${t.done ? 'x' : 'o'} ${t.text}`)))

test('the fixtures: 14 checklists, 28 open and 14 done, one column per notebook in sidebar order', () => {
  const b = board(notes, shelf, title)
  assert.deepEqual([b.lists, b.open, b.done], [14, 28, 14])
  assert.deepEqual(
    b.columns.map((c) => `${c.name} ${c.open}/${c.done}`),
    ['Home 11/5', 'Inbox 1/0', 'Travel 5/2', 'Work 2/2', 'Meetings 3/1', 'Projects 6/4'],
  )
  const kickoff = b.columns.find((c) => c.name === 'Projects')!.cards.find((c) => c.title === 'Harbor redesign: kickoff')!
  assert.deepEqual(
    kickoff.tasks.map((t) => [t.line, t.done, t.text]),
    [
      ['fx-note-00-t:0', true, 'Agree goals with the client'],
      ['fx-note-00-t:1', true, 'Draft the sitemap'],
      ['fx-note-00-t:2', false, 'Book the design review'],
      ['fx-note-00-t:3', false, 'Share the timeline'],
    ],
  )
})

test('a line key names the block and the item, and reads back exactly', () => {
  assert.deepEqual(lineOf(lineKey('fx-note-00-t', 3)), {block: 'fx-note-00-t', item: 3})
  assert.deepEqual(lineOf('a:b:12'), {block: 'a:b', item: 12})
  for (const bad of [undefined, '', 'abc', ':1', 'b:', 'b:-1', 'b:1.5', 'b: 1', 'b:1e3', 'b:1234567']) assert.equal(lineOf(bad), undefined, String(bad))
})

test('every item shape counts: inline arrays, content and plain text; a blank line is no task but keeps its place', () => {
  const b = board([note('n', [checklist('c', [[...text('array')], {content: text('content'), checked: true}, {text: 'plain'}, {content: text('  ')}, {text: 'last'}])])], shelve([nb('a')]), () => undefined)
  assert.deepEqual(lines(b), ['n c:0 0 o array', 'n c:1 0 x content', 'n c:2 0 o plain', 'n c:4 0 o last'])
  assert.deepEqual([b.open, b.done, b.lists], [3, 1, 1])
})

test('only checked: true is done', () => {
  const b = board([note('n', [checklist('c', [{text: 'a', checked: 'yes' as unknown as boolean}, {text: 'b', checked: false}, {text: 'c'}])])], shelve([nb('a')]), () => undefined)
  assert.deepEqual([b.open, b.done], [3, 0])
})

test('a nested checklist line shows under its parent and opens at the parent line', () => {
  const inner = checklist('inner', [{text: 'deep', checked: true}, {text: 'deeper'}])
  const b = board([note('n', [checklist('c', [{text: 'top'}, {text: 'parent', children: [inner, {id: 'b', type: 'list', items: [text('bullet')]}]}])])], shelve([nb('a')]), () => undefined)
  assert.deepEqual(lines(b), ['n c:0 0 o top', 'n c:1 0 o parent', 'n c:1 1 x deep', 'n c:1 1 o deeper'])
})

test('plain lists, empty checklists and other blocks make no card', () => {
  const b = board([note('n', [{id: 'l', type: 'list', items: [text('bullet')]}, checklist('e', []), checklist('blank', [{text: ' '}]), {id: 'p', type: 'paragraph', content: text('[ ] not a task')}])], shelve([nb('a')]), () => undefined)
  assert.deepEqual(b, {columns: [], open: 0, done: 0, lists: 0})
})

test('newest note first in a column; one card per checklist, in body order', () => {
  const older = note('old', [checklist('o', [{text: 'o'}])], {updatedAt: '2026-10-01T00:00:00Z'})
  const newer = note('new', [checklist('n1', [{text: 'one'}]), {id: 'p', type: 'paragraph'}, checklist('n2', [{text: 'two'}])], {updatedAt: '2026-10-02T00:00:00Z'})
  const b = board([older, newer], shelve([nb('a')]), () => undefined)
  assert.deepEqual(b.columns[0].cards.map((c) => `${c.note}/${c.block}`), ['new/n1', 'new/n2', 'old/o'])
})

test('no task goes missing: a notebook off the shelf gets the last column, a deeper notebook its own', () => {
  const s = shelve([nb('a'), nb('b', 'a'), nb('c', 'b')])
  const b = board([note('lost', [checklist('l', [{text: 'lost'}])], {notebook: 'gone'}), note('none', [checklist('x', [{text: 'none'}])], {notebook: null}), note('deep', [checklist('d', [{text: 'deep'}])], {notebook: 'c'}), note('top', [checklist('t', [{text: 'top'}])], {notebook: 'b'})], s, () => undefined)
  assert.deepEqual(
    b.columns.map((c) => [c.notebook, c.name, c.cards.map((x) => x.note).sort().join(',')]),
    [
      ['b', 'B', 'top'],
      ['c', 'C', 'deep'],
      [null, 'No notebook', 'lost,none'],
    ],
  )
  assert.equal(lines(b).length, 4)
})

test('a linked note in a task line reads with its current title, and an untitled note card says Untitled', () => {
  const item = {content: [{type: 'text', value: 'Ask '}, {type: 'wikilink', docId: 'kari', target: 'kari', children: text('kari')}]}
  const b = board([note('n', [checklist('c', [item])], {title: ''})], shelve([nb('a')]), (id) => (id === 'kari' ? 'Kari Eksempel' : undefined))
  assert.equal(b.columns[0].cards[0].title, 'Untitled')
  assert.equal(b.columns[0].cards[0].tasks[0].text, 'Ask Kari Eksempel')
})

test('a plain-text checklist line is searchable and has body text', () => {
  const n = note('n', [checklist('c', [{text: 'Renew the passport'}])], {title: 'Trip'})
  assert.equal(blockText(n.blocks[0]), 'Renew the passport')
  assert.deepEqual(find([n], 'passport').notes.map((x) => x.id), ['n'])
})
