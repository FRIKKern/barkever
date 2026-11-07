import {test} from 'node:test'
import assert from 'node:assert/strict'
import {board} from './board.ts'
import {blockText, contentOf, inlineText, isBlank, itemContent, wikilinks, type Block, type Inline, type Note} from './model.ts'
import {shelve} from './notebooks.ts'

const BAD: unknown[] = ['x', {a: 1}, 5, true]
const text = (value: string): Inline => ({type: 'text', value})
const note = (blocks: Block[]): Note => ({id: 'n', title: '', notebook: 'a', tags: [], blocks, links: [], updatedAt: '2026-10-01T00:00:00Z', rev: '', conflicts: [], gen: 0})
const para = (content: unknown): Block => ({id: 'p', type: 'paragraph', content} as never)
const inItem = (content: unknown): Block => ({id: 'l', type: 'list', items: [{content} as never]})
const inNested = (content: unknown): Block => ({id: 'l', type: 'list', items: [{content: [text('Pier')], children: [para(content)]} as never]})

for (const bad of BAD) {
  const shown = JSON.stringify(bad)

  test(`content ${shown} reads as no inlines, top level, in an item and under a nested item`, () => {
    assert.deepEqual(contentOf(para(bad) as never), [])
    assert.equal(blockText(para(bad)), '')
    assert.equal(blockText(inItem(bad)), '')
    assert.equal(blockText(inNested(bad)), 'Pier')
    assert.deepEqual(wikilinks([para(bad), inItem(bad), inNested(bad)]), [])
  })

  test(`inline children ${shown} read as no inlines, top level and in an item`, () => {
    const mark = {type: 'strong', children: bad} as never as Inline
    const link = {type: 'wikilink', docId: 'pier', target: 'Pier', children: bad} as never as Inline
    assert.equal(inlineText([mark]), '')
    assert.equal(blockText(para([text('a'), mark, text('b')])), 'ab')
    assert.equal(blockText(inItem([text('a'), mark, text('b')])), 'ab')
    assert.deepEqual(wikilinks([para([mark, link]), inItem([mark, link])]), ['pier'])
    assert.equal(blockText(para([link])), '')
  })

  test(`a note holding only content ${shown} is kept: isBlank never throws it away`, () => {
    assert.equal(isBlank(note([para(bad)])), false)
    assert.equal(isBlank(note([inItem(bad)])), false)
  })

  test(`the board makes no task of a checklist item with content ${shown}, and keeps the next one`, () => {
    const b = board([note([{id: 'c', type: 'list', task: true, items: [{content: bad} as never, {content: [text('rope')]}]}])], shelve([{id: 'a', name: 'A', parent: null}]), () => undefined)
    assert.deepEqual(b.columns.flatMap((c) => c.cards.flatMap((card) => card.tasks.map((t) => t.text))), ['rope'])
  })
}

test('text is still the fallback when content is not an array', () => {
  assert.equal(blockText({id: 'h', type: 'heading', text: 'Winter', content: 'x'} as never), 'Winter')
})

test('entries of a content or children array that are not objects are skipped, in the order given', () => {
  assert.equal(blockText(para([null, 'x', 5, text('kept'), [text('no')]])), 'kept')
  assert.equal(blockText(para([{type: 'strong', children: [null, text('held')]}])), 'held')
  assert.deepEqual(itemContent([null, text('kept')] as never), [text('kept')])
})
