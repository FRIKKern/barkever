import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {toNote, toNotebook, type BpNote, type BpNotebook} from './note-docs.ts'
import {linkContext, snippet, wikilinks} from './model.ts'

const fixtures = readFileSync(new URL('../../../fixtures/notes.ndjson', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const notes = fixtures.filter((d) => d._type === 'note').map((d) => toNote(d as BpNote))
const notebooks = fixtures.filter((d) => d._type === 'notebook').map((d) => toNotebook(d as BpNotebook))

test('drafts resolve to the published id on note, notebook and links', () => {
  const n = toNote({_id: 'drafts.n1', _rev: 'r1', title: 'Draft', notebook: {_ref: 'drafts.nb-1'}, links: [{_ref: 'drafts.n2'}, {_ref: 'n2'}]})
  assert.deepEqual(n, {id: 'n1', title: 'Draft', notebook: 'nb-1', tags: [], blocks: [], links: ['n2'], updatedAt: '', rev: 'r1', conflicts: [], gen: 0})
})

test('blank title, missing notebook and null fields fall back', () => {
  const n = toNote({_id: 'a', title: '  ', notebook: null, tags: null, links: null, body: null})
  assert.deepEqual([n.title, n.notebook, n.tags, n.links, n.blocks], ['', null, [], [], []])
})

test('notebooks keep their stack parent', () => {
  assert.deepEqual(toNotebook({_id: 'drafts.p', name: 'Projects', parent: {_ref: 'w'}}), {id: 'p', name: 'Projects', parent: 'w'})
})

test('the 50 fixtures map to notes in named notebooks', () => {
  assert.equal(notes.length, 50)
  const ids = new Set(notebooks.map((nb) => nb.id))
  assert.ok(notes.every((n) => n.notebook && ids.has(n.notebook)))
})

test('every fixture body wikilink is mirrored in links[]', () => {
  for (const n of notes) assert.deepEqual([...wikilinks(n.blocks)].sort(), [...n.links].sort(), n.id)
})

test('wikilinks are found inside list items and nested inlines', () => {
  const blocks = [
    {id: 'l', type: 'list', items: [{content: [{type: 'wikilink', docId: 'a', children: [{type: 'text', value: 'A'}]}]}, [{type: 'wikilink', target: 'b'}]]},
    {id: 'p', type: 'paragraph', content: [{type: 'strong', children: [{type: 'wikilink', docId: 'c'}]}]},
  ]
  assert.deepEqual(wikilinks(blocks), ['a', 'b', 'c'])
})

test('link context is the sentence that holds the link; snippet skips headings', () => {
  const kickoff = notes.find((n) => n.id === 'fx-note-00')!
  const sitemap = notes.find((n) => n.id === 'fx-note-01')!
  assert.equal(linkContext(sitemap.blocks, 'fx-note-00'), 'See Harbor redesign: kickoff.')
  assert.match(snippet(kickoff), /^Goals for the Harbor/)
  assert.equal(snippet({...kickoff, blocks: []}), 'No text yet')
})
