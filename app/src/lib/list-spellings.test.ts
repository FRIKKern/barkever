import {test} from 'node:test'
import assert from 'node:assert/strict'
import {board, ticked} from './board.ts'
import {blockText, isBlank, nestedOf, wikilinks, type Block, type Inline, type Note} from './model.ts'
import {shelve} from './notebooks.ts'

const text = (value: string): Inline => ({type: 'text', value})
const link = (words: string, docId: string): Inline => ({type: 'wikilink', target: words, docId, children: [text(words)]})
const note = (blocks: Block[]): Note => ({id: 'n', title: '', notebook: 'a', tags: [], blocks, links: [], updatedAt: '2026-10-01T00:00:00Z', rev: '', conflicts: [], gen: 0})
const under = (child: unknown): Block => ({id: 'l', type: 'list', items: [{content: [text('Pier')], children: [child as Block]}]})

const SPELLINGS: [string, boolean][] = [
  ['list', false],
  ['bulletList', false],
  ['bullet_list', false],
  ['bulleted-list', false],
  ['bulleted_list', false],
  ['ordered-list', true],
  ['numbered_list', true],
]

for (const [type, ordered] of SPELLINGS) {
  test(`a nested ${type} reads as a list: its words, its links, its blank state, and ${ordered ? 'numbered' : 'bulleted'}`, () => {
    const child = {id: 'c', type, items: [[text('Check '), link('Tide gauge', 'g')], {text: 'rope'}]}
    const list = under(child)
    assert.equal(blockText(list), 'Pier · Check Tide gauge · rope')
    assert.deepEqual(wikilinks([list]), ['g'])
    assert.equal(nestedOf(list.items![0]!)[0]!.type, 'list')
    assert.equal(nestedOf(list.items![0]!)[0]!.ordered === true, ordered)
    assert.equal(isBlank(note([{id: 'l', type: 'list', items: [{content: [], children: [{id: 'c', type, items: [[], {content: []}]} as Block]}]}])), true)
  })
}

test('ordered: true numbers any nested spelling, and the stored child is left as it was', () => {
  const child = {id: 'c', type: 'bulletList', ordered: true, items: [[text('one')]]}
  const list = under(child)
  assert.equal(nestedOf(list.items![0]!)[0]!.ordered, true)
  assert.equal((list.items![0] as {children: Block[]}).children[0], child)
})

test('like the canvas, a nested spelling without an items array and a top-level spelling are not lists', () => {
  assert.equal(nestedOf(under({id: 'c', type: 'bulletList', content: [text('loose')]}).items![0]!)[0]!.type, 'bulletList')
  assert.equal(blockText({id: 'b', type: 'bulletList', items: [[text('top')]]} as Block), '')
})

test('a nested bulletList checklist makes board tasks, and its box ticks it', () => {
  const blocks: Block[] = [{id: 'c', type: 'list', task: true, items: [{text: 'parent', children: [{id: 'inner', type: 'bulletList', task: true, items: [{text: 'deep'}]} as Block]}]}]
  const b = board([note(blocks)], shelve([{id: 'a', name: 'A', parent: null}]), () => undefined)
  const tasks = b.columns.flatMap((c) => c.cards.flatMap((card) => card.tasks))
  assert.deepEqual(tasks.map((t) => [t.text, t.depth]), [['parent', 0], ['deep', 1]])
  const after = ticked(blocks, tasks[1]!.box)
  assert.equal(((after[0]!.items![0] as {children: Block[]}).children[0]!.items![0] as {checked?: boolean}).checked, true)
  assert.equal((after[0]!.items![0] as {children: Block[]}).children[0]!.type, 'bulletList')
})

test('every bad form of a nested child reads as a pinned shape, never a crash', () => {
  const kid = (child: unknown) => nestedOf(under(child).items![0]!)[0]
  for (const type of [undefined, '', 5, 'Bullet_List', 'ordered_list', 'b'.repeat(100_000)]) assert.equal(kid({id: 'c', type, items: [[text('x')]]})!.type, type)
  for (const items of ['x', {a: 1}, undefined]) assert.equal(kid({id: 'c', type: 'bulletList', items})!.type, 'bulletList')
  assert.equal(blockText(under({id: 'c', type: 'bulletList', items: []})), 'Pier')
  assert.equal(blockText(under({id: 'c', type: 'bulletList', items: Array.from({length: 20_000}, () => [text('r')])})).length, 'Pier'.length + 20_000 * ' · r'.length)
  for (const ordered of ['true', 1, null]) assert.equal(kid({id: 'c', type: 'bulletList', ordered, items: []})!.ordered, false)
  assert.equal(kid({id: 'c', type: 'numbered_list', ordered: false, items: []})!.ordered, true)
  assert.deepEqual(nestedOf(under({id: 'c', type: 'list', ordered: true, items: [[text('a')]]}).items![0]!)[0]!.ordered, kid({id: 'c', type: 'ordered-list', items: [[text('a')]]})!.ordered)
})

test('children that are not a list of objects, and an item that is not an object, read as no nested list', () => {
  for (const children of [null, {a: 1}, 'x', 5]) {
    const list: Block = {id: 'l', type: 'list', items: [{content: [text('Pier')], children} as never]}
    assert.deepEqual(nestedOf(list.items![0]!), [])
    assert.equal(blockText(list), 'Pier')
    assert.deepEqual(wikilinks([list]), [])
  }
  assert.deepEqual(nestedOf({content: [], children: [null, 's', [], 5, {id: 'c', type: 'bulletList', items: [[text('kept')]]}]} as never).map((c) => c.type), ['list'])
  for (const it of [null, 5, true]) {
    assert.deepEqual(nestedOf(it as never), [])
    assert.equal(blockText({id: 'l', type: 'list', items: [it as never, [text('after')]]}), 'after')
  }
  assert.equal(isBlank(note([{id: 'l', type: 'list', items: [null as never, {content: [], children: [null, [], ''] as never}]}])), true)
})

test('a checklist item whose children are not a list of objects still ticks, and keeps those children as stored', () => {
  for (const children of [null, {a: 1}, 'x', [null, 's', 5]]) {
    const blocks: Block[] = [{id: 'c', type: 'list', task: true, items: [{text: 'parent', children} as never, {text: 'two'}]}]
    const tasks = board([note(blocks)], shelve([{id: 'a', name: 'A', parent: null}]), () => undefined).columns.flatMap((c) => c.cards.flatMap((card) => card.tasks))
    const after = ticked(blocks, tasks[1]!.box)
    assert.equal((after[0]!.items![1] as {checked?: boolean}).checked, true)
    assert.deepEqual((after[0]!.items![0] as {children: unknown}).children, children)
  }
})

test('a list whose items are not an array reads as a list with no lines, top level or nested, and a tick beside it still ticks', () => {
  const good: Block = {id: 'good', type: 'list', task: true, items: [{text: 'tick me'}]}
  for (const items of ['x', {a: 1}, 5]) {
    const top = {id: 't', type: 'list', task: true, items} as unknown as Block
    const nested: Block = {id: 'l', type: 'list', items: [{content: [text('Pier')], children: [{id: 'c', type: 'list', items} as unknown as Block]}]}
    assert.equal(blockText(top), '')
    assert.equal(blockText(nested), 'Pier')
    assert.deepEqual(wikilinks([top, nested]), [])
    const tasks = board([note([good, top, nested])], shelve([{id: 'a', name: 'A', parent: null}]), () => undefined).columns.flatMap((c) => c.cards.flatMap((card) => card.tasks))
    assert.deepEqual(tasks.map((t) => t.text), ['tick me'])
    const after = ticked([good, top, nested], tasks[0]!.box)
    assert.equal((after[0]!.items![0] as {checked?: boolean}).checked, true)
    assert.equal(after[1], top)
    assert.equal(isBlank(note([top])), false)
  }
})
