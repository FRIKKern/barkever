import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blockText, hitLine, linkContext, snippet, titleIn, type Block, type Inline, type Note} from './model.ts'
import {linkPreview} from './link-pick.ts'

const note = (id: string, title: string, blocks: Block[] = []): Note => ({id, title, notebook: null, tags: [], blocks, links: [], updatedAt: '2026-10-30', rev: 'r', conflicts: [], gen: 0})
const text = (value: string): Inline => ({type: 'text', value})
const link = (words: string, target: string, docId?: string): Inline => ({type: 'wikilink', target, docId, children: [text(words)]})
const para = (id: string, ...content: Inline[]): Block => ({id, type: 'paragraph', content})

const gauge = note('g', 'Tide gauge: autumn check')
const blank = note('b', '')
const source = note('s', 'Pier walk', [
  {id: 'h', type: 'heading', level: 2, content: [text('Check '), link('Tide gauge: spring check', 'Tide gauge: spring check', 'g')]},
  para('p1', text('First '), link('Tide gauge: spring check', 'Tide gauge: spring check', 'g'), text(' then the rest.')),
  para('p2', text('Own words: '), link('the gauge', 'Tide gauge: spring check', 'g'), text(', gone: '), link('Old buoy', 'Old buoy', 'x'), text(', no id: '), link('Plain', 'Plain')),
  {id: 'l', type: 'list', items: [[text('Ask '), link('b', 'b', 'b')], [text('two')]]},
])
const byId = new Map([gauge, blank, source].map((n) => [n.id, n]))
const title = titleIn(byId)
const [, p1, p2, list] = source.blocks

test('a painted link shows its target\'s current title in every plain-text view', () => {
  assert.equal(snippet(source, title), 'First Tide gauge: autumn check then the rest.')
  assert.equal(linkContext(source.blocks, 'g', title), 'Check Tide gauge: autumn check')
  assert.equal(hitLine(source, ['rest'], title), 'First Tide gauge: autumn check then the rest.')
  assert.equal(linkPreview(byId, 's', () => '').excerpt, 'First Tide gauge: autumn check then the rest.')
})

test('a hit line is found by the stored words, and shows the current title', () => {
  assert.equal(hitLine(source, ['spring'], title), 'Check Tide gauge: autumn check')
  assert.equal(hitLine(source, ['autumn'], title), undefined)
})

test('own words, a deleted target and a link without an id keep their stored words; a blank title reads Untitled', () => {
  assert.equal(linkContext(source.blocks, 'x', title), 'Own words: the gauge, gone: Old buoy, no id: Plain')
  assert.equal(linkContext([list], 'b', title), 'Ask Untitled · two')
})

test('a target deleted and recreated under a new id does not take over the old link', () => {
  const again = note('g2', 'Tide gauge: spring check')
  const after = titleIn(new Map([blank, source, {...again, title: 'Tide gauge: winter check'}].map((n) => [n.id, n])))
  assert.equal(snippet(source, after), 'First Tide gauge: spring check then the rest.')
})

test('blockText still reads the stored words, for search, merge and the conflict view', () => {
  assert.deepEqual([p1, p2, list].map(blockText), ['First Tide gauge: spring check then the rest.', 'Own words: the gauge, gone: Old buoy, no id: Plain', 'Ask b · two'])
})
