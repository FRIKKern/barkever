import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {board, findLine, lineKey, lineOf, summary, textSum} from './board.ts'
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
const spot = (line: string) => line.replace(/:[0-9a-z]+:\d+$/, '')
const lines = (b: ReturnType<typeof board>) => b.columns.flatMap((c) => c.cards.flatMap((card) => card.tasks.map((t) => `${card.note} ${spot(t.line)} ${t.depth} ${t.done ? 'x' : 'o'} ${t.text}`)))

test('the fixtures: 14 checklists, 28 open and 14 done, one column per notebook in sidebar order', () => {
  const b = board(notes, shelf, title)
  assert.deepEqual([b.lists, b.open, b.done], [14, 28, 14])
  assert.equal(summary(b), '28 open · 14 done · from 14 checklists')
  assert.equal(summary({columns: [], open: 1, done: 0, lists: 1}), '1 open · 0 done · from 1 checklist')
  assert.deepEqual(
    b.columns.map((c) => `${c.name} ${c.open}/${c.done}`),
    ['Home 11/5', 'Inbox 1/0', 'Travel 5/2', 'Work 2/2', 'Meetings 3/1', 'Projects 6/4'],
  )
  const kickoff = b.columns.find((c) => c.name === 'Projects')!.cards.find((c) => c.title === 'Harbor redesign: kickoff')!
  assert.deepEqual(
    kickoff.tasks.map((t) => [spot(t.line), t.done, t.text]),
    [
      ['fx-note-00-t:0', true, 'Agree goals with the client'],
      ['fx-note-00-t:1', true, 'Draft the sitemap'],
      ['fx-note-00-t:2', false, 'Book the design review'],
      ['fx-note-00-t:3', false, 'Share the timeline'],
    ],
  )
  assert.equal(kickoff.tasks[3].line, `fx-note-00-t:3:${textSum({text: 'Share the timeline'})}:0`)
})

test('a line key names the block, the item, a sum of its stored words and which twin it is, and reads back exactly', () => {
  const sum = textSum({text: 'Share the timeline'})
  assert.match(sum, /^[0-9a-z]{1,7}$/)
  assert.deepEqual(lineOf(lineKey('fx-note-00-t', 3, {text: 'Share the timeline'}, 2)), {block: 'fx-note-00-t', item: 3, sum, nth: 2})
  assert.deepEqual(lineOf('a:b:12:x9:0'), {block: 'a:b', item: 12, sum: 'x9', nth: 0})
  assert.deepEqual(lineOf('b:999999:zzzzzzz:999999'), {block: 'b', item: 999999, sum: 'zzzzzzz', nth: 999999})
  const long = Array.from({length: 200}, (_, i) => textSum({text: `line ${i}`}))
  assert.ok(long.some((x) => x.length === 7))
  for (const x of long) assert.equal(lineOf(`b:0:${x}:0`)?.sum, x)
  const bad = [undefined, '', 'abc', 'b:1:a', ':1:a:0', 'b::a:0', 'b:1::0', 'b:1:a:', 'b:-1:a:0', 'b:1.5:a:0', 'b: 1:a:0', 'b:1234567:a:0', 'b:1:ABC:0', 'b:1:12345678:0', 'b:1:a b:0', 'b:1:a:-1', 'b:1:a:1234567', 'b:1:a:x']
  for (const x of bad) assert.equal(lineOf(x), undefined, String(x))
})

test('the sum reads stored words only: a tick, a renamed link target or a new item shape keep it; new words change it', () => {
  const link = {type: 'wikilink', docId: 'kari', target: 'kari', children: text('kari')}
  const base = textSum({content: [...text('Ask '), link]})
  assert.equal(textSum({content: [...text('Ask '), link], checked: true}), base)
  assert.equal(textSum([...text('Ask '), link]), base)
  assert.equal(textSum({text: 'Ask kari'}), base)
  const b = board([note('n', [checklist('c', [{content: [...text('Ask '), link]}])])], shelve([nb('a')]), () => 'Kari Eksempel')
  assert.equal(b.columns[0].cards[0].tasks[0].text, 'Ask Kari Eksempel')
  assert.equal(b.columns[0].cards[0].tasks[0].line, `c:0:${base}:0`)
  assert.notEqual(textSum({text: 'Ask Kari'}), base)
  assert.notEqual(textSum({text: 'Ask kari '}), base)
})

test('a stale line finds its words: lines added or removed above, its own twin, the nearest twin when that twin is gone, another checklist; else it is gone', () => {
  const at = (blocks: Block[], item = 1, nth = 0) => findLine(blocks, lineKey('c', item, {text: 'Buy stamps'}, nth))
  const c = (...words: string[]) => [checklist('c', words.map((text) => ({text})))]
  assert.deepEqual(at(c('Weigh', 'Buy stamps')), {block: 'c', item: 1})
  assert.deepEqual(at(c('New', 'Weigh', 'Buy stamps')), {block: 'c', item: 2})
  assert.deepEqual(at(c('Buy stamps')), {block: 'c', item: 0})
  assert.deepEqual(at(c('New', 'Alpha', 'Buy stamps', 'Buy stamps', 'Omega'), 2, 1), {block: 'c', item: 3})
  assert.deepEqual(at(c('New', 'Buy stamps', 'Buy stamps'), 1, 1), {block: 'c', item: 2})
  assert.deepEqual(at(c('Buy stamps', 'Buy stamps'), 1, 0), {block: 'c', item: 0})
  assert.deepEqual(at(c('Buy stamps', 'x', 'y', 'z', 'Buy stamps'), 3, 2), {block: 'c', item: 4})
  assert.deepEqual(at(c('x', 'Buy stamps', 'y', 'z', 'Buy stamps'), 1, 2), {block: 'c', item: 1})
  assert.deepEqual(at(c('Buy stamps'), 1, 1), {block: 'c', item: 0})
  assert.deepEqual(at([checklist('d', [{text: 'other'}]), checklist('e', [{text: 'x'}, {text: 'Buy stamps', checked: true}])]), {block: 'e', item: 1})
  assert.deepEqual(at([checklist('d', [{text: 'x'}, {text: 'Buy stamps'}]), checklist('c', [{text: 'Buy stamps'}])]), {block: 'c', item: 0})
  assert.deepEqual(at([checklist('d', [{text: 'x'}, {text: 'x'}, {text: 'Buy stamps'}]), checklist('c', [{text: 'Buy stamps'}, {text: 'y'}, {text: 'Buy stamps'}])], 2, 0), {block: 'c', item: 0})
  assert.deepEqual(at([checklist('d', [{text: 'other'}]), checklist('e', [{text: 'Buy stamps'}, {text: 'x'}, {text: 'Buy stamps'}])]), {block: 'e', item: 0})
  assert.equal(at([{id: 'c', type: 'list', task: true}]), 'gone')
  assert.equal(at(c('Weigh', 'Buy stamp')), 'gone')
  assert.equal(at(c()), 'gone')
  assert.equal(at([{id: 'c', type: 'list', items: [text('Buy stamps')]}, {id: 'p', type: 'paragraph', content: text('Buy stamps')}]), 'gone')
  assert.equal(at([]), 'gone')
  assert.equal(findLine(c('Buy stamps'), undefined), undefined)
  assert.equal(findLine(c('Buy stamps'), 'c:0'), undefined)
})

test('twins get their own keys in order, so each card row opens its own twin', () => {
  const b = board([note('n', [checklist('c', [{text: 'Twin'}, {text: 'Alpha'}, {text: 'Twin'}, {text: 'Twin', checked: true}])])], shelve([nb('a')]), () => undefined)
  const keys = b.columns[0].cards[0].tasks.map((t) => t.line)
  assert.deepEqual(keys.map((k) => lineOf(k)!.nth), [0, 0, 1, 2])
  const moved = [checklist('c', [{text: 'New'}, {text: 'Twin'}, {text: 'Alpha'}, {text: 'Twin'}, {text: 'Twin'}])]
  assert.deepEqual(keys.map((k) => findLine(moved, k)), [{block: 'c', item: 1}, {block: 'c', item: 2}, {block: 'c', item: 3}, {block: 'c', item: 4}])
})

test('the board reuses the cards of an unchanged note and rebuilds a changed note or a renamed link target', () => {
  const link = {type: 'wikilink', docId: 'kari', target: 'kari', children: text('kari')}
  const same = note('same', [checklist('s', [{content: [...text('Ask '), link]}])])
  const other = note('other', [checklist('o', [{text: 'Pack'}])])
  const first = board([same, other], shelve([nb('a')]), () => 'Kari')
  const card = (b: ReturnType<typeof board>, id: string) => b.columns.flatMap((c) => c.cards).find((x) => x.note === id)!
  const again = board([same, {...other, blocks: [checklist('o', [{text: 'Pack'}, {text: 'Seal'}])]}], shelve([nb('a')]), () => 'Kari')
  assert.equal(card(again, 'same'), card(first, 'same'))
  assert.deepEqual(card(again, 'other').tasks.map((t) => t.text), ['Pack', 'Seal'])
  const renamed = board([same, other], shelve([nb('a')]), (id) => (id === 'kari' ? 'Kari Nordmann' : undefined))
  assert.deepEqual(card(renamed, 'same').tasks.map((t) => t.text), ['Ask Kari Nordmann'])
})

test('a save at 5000 notes with 30 lines each rebuilds the board in under 16 ms', () => {
  const notes = Array.from({length: 5000}, (_, i) => note(`n${i}`, [checklist(`c${i}`, Array.from({length: 30}, (_, j) => ({text: `line ${j} of ${i}`, checked: j % 3 === 0})))], {notebook: `nb${i % 7}`}))
  const shelf = shelve(Array.from({length: 7}, (_, i) => nb(`nb${i}`)))
  board(notes, shelf, () => undefined)
  const saved = notes.map((n, i) => (i === 42 ? {...n, blocks: [checklist('c42', [{text: 'changed'}])]} : n))
  const runs = Array.from({length: 5}, () => {
    const t = performance.now()
    board(saved, shelf, () => undefined)
    return performance.now() - t
  }).sort((a, b) => a - b)
  assert.ok(runs[2] < 16, `median ${runs[2].toFixed(1)} ms`)
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
  assert.equal(summary(b), 'No checklists yet. Start a line in a note with [ ] and a space.')
})

test('newest note first in a column; one card per checklist, in body order', () => {
  const older = note('old', [checklist('o', [{text: 'o'}])], {updatedAt: '2026-10-01T00:00:00Z'})
  const newer = note('new', [checklist('n1', [{text: 'one'}]), {id: 'p', type: 'paragraph'}, checklist('n2', [{text: 'two'}])], {updatedAt: '2026-10-02T00:00:00Z'})
  const b = board([older, newer], shelve([nb('a')]), () => undefined)
  assert.deepEqual(b.columns[0].cards.map((c) => `${c.note}/${c.block}`), ['new/n1', 'new/n2', 'old/o'])
})

test('no task goes missing: a notebook off the shelf gets the last column, a deeper notebook its own', () => {
  const s = shelve([nb('a'), nb('b', 'a'), nb('c', 'b')])
  const b = board([note('a-lost', [checklist('l', [{text: 'lost'}])], {notebook: 'gone'}), note('b-none', [checklist('x', [{text: 'none'}])], {notebook: null}), note('z-deep', [checklist('d', [{text: 'deep'}])], {notebook: 'c'}), note('z-top', [checklist('t', [{text: 'top'}])], {notebook: 'b'})], s, () => undefined)
  assert.deepEqual(
    b.columns.map((c) => [c.notebook, c.name, c.cards.map((x) => x.note).sort().join(',')]),
    [
      ['b', 'B', 'z-top'],
      ['c', 'C', 'z-deep'],
      [null, 'No notebook', 'a-lost,b-none'],
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
