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
