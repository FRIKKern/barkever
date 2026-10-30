import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blockText, hitLine, isBlank, linkContext, snippet, titleIn, type Block, type Inline, type Note} from './model.ts'
import {linkPreview} from './link-pick.ts'
import {find} from './search.ts'
import {empty} from '../replica/made.ts'

const text = (value: string): Inline => ({type: 'text', value})
const wrap = (type: string, ...children: Inline[]): Inline => ({type, children})
const note = (id: string, title: string, blocks: Block[]): Note => ({id, title, notebook: null, tags: [], blocks, links: [], updatedAt: '2026-10-30', rev: 'r', conflicts: [], gen: 0})

const marked: Block = {
  id: 'p',
  type: 'paragraph',
  content: [wrap('strong', text('Rope')), text(' and '), wrap('em', text('chain'), wrap('strong', text(' links'))), text(', '), {type: 'code', value: 'knot()'}, text(', '), wrap('underline', text('buoy')), text(', '), wrap('strikethrough', text('net')), text(', '), ({type: 'link', href: 'https://example.com', children: [text('dock')]} as Inline), text(' near '), {type: 'wikilink', target: 'Pier', docId: 'pier', children: [text('Pier')]}],
}
const LINE = 'Rope and chain links, knot(), buoy, net, dock near Pier walk'
const list: Block = {id: 'l', type: 'list', items: [[wrap('strong', text('Bold item'))], {content: [wrap('em', text('Italic item'))]}]}
const shed = note('s', 'Shed', [marked, list])
const pier = note('pier', 'Pier walk', [{id: 'q', type: 'paragraph', content: [text('Plain.')]}])
const byId = new Map([shed, pier].map((n) => [n.id, n]))
const title = titleIn(byId)

test('every mark reads as its words: bold, italic, nested, code, underline, strike, a web link and list items', () => {
  assert.equal(blockText(marked), 'Rope and chain links, knot(), buoy, net, dock near Pier')
  assert.equal(blockText(list), 'Bold item · Italic item')
})

test('the list line, the search hit line, the backlink line and the link card read marked words', () => {
  assert.equal(snippet(shed, title), LINE)
  assert.equal(hitLine(shed, ['chain'], title), LINE)
  assert.equal(linkContext(shed.blocks, 'pier', title), LINE)
  assert.equal(linkPreview(byId, 's', () => '').excerpt, LINE)
})

test('search finds a note by a word that is only bold, italic, code or in a list item', () => {
  for (const q of ['rope', 'chain', 'knot', 'italic']) assert.deepEqual(find([shed, pier], q).notes.map((n) => n.id), ['s'], q)
})

test('an untitled note whose only text is bold is not blank, so leaving it never drops it', () => {
  const bold = note('b', '', [{id: 'p', type: 'paragraph', content: [wrap('strong', text('Buy rope'))]}])
  assert.equal(isBlank(bold), false)
  assert.equal(empty({_id: 'b', _type: 'note', title: '', tags: [], links: [], body: {blocks: bold.blocks}}), false)
})
