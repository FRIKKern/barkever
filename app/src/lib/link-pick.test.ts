import {test} from 'node:test'
import assert from 'node:assert/strict'
import {linkCandidates, linkPreview, PICKS} from './link-pick.ts'
import type {Note} from './model.ts'

const note = (id: string, title: string, updatedAt: string, notebook: string | null = 'nb-work'): Note => ({id, title, notebook, tags: [], blocks: [], links: [], updatedAt, rev: '', conflicts: [], gen: 0})

const notes = [
  note('kick', 'Harbor redesign: kickoff', '2026-10-02'),
  note('call', 'Client call: Harbor', '2026-10-03', 'nb-home'),
  note('map', 'Harbor redesign: sitemap', '2026-10-04'),
  note('blank', '  ', '2026-10-05'),
  note('bread', 'Recipes: sourdough', '2026-10-01', null),
]
const names: Record<string, string> = {'nb-work': 'Projects', 'nb-home': 'Home'}
const pick = (q: string, from = 'map') => linkCandidates(notes, from, q, (id) => (id ? names[id] : ''))
const titles = (q: string, from?: string) => pick(q, from).map((c) => c.title)

test('a title that starts with the query comes first, then any title holding it, newest first', () => {
  assert.deepEqual(titles('harbor'), ['Harbor redesign: kickoff', 'Client call: Harbor'])
  assert.deepEqual(titles('HARB'), ['Harbor redesign: kickoff', 'Client call: Harbor'])
})

test('every word must be in the title, in any order', () => {
  assert.deepEqual(titles('red harb'), ['Harbor redesign: kickoff'])
  assert.deepEqual(titles('harbor sourdough'), [])
})

test('an empty query offers the newest notes; the open note and untitled notes are never offered', () => {
  assert.deepEqual(titles(''), ['Client call: Harbor', 'Harbor redesign: kickoff', 'Recipes: sourdough'])
  assert.deepEqual(titles('  ', 'kick'), ['Harbor redesign: sitemap', 'Client call: Harbor', 'Recipes: sourdough'])
})

test('a candidate carries the exact id and its notebook as the badge', () => {
  assert.deepEqual(pick('client'), [{title: 'Client call: Harbor', id: 'call', type: 'Home'}])
  assert.deepEqual(pick('sour'), [{title: 'Recipes: sourdough', id: 'bread', type: ''}])
})

test(`at most ${PICKS} candidates`, () => {
  const many = Array.from({length: 30}, (_, i) => note(`n${i}`, `Note ${i}`, `2026-10-${String(i + 1).padStart(2, '0')}`))
  const got = linkCandidates(many, 'x', 'note', () => '')
  assert.equal(got.length, PICKS)
  assert.equal(got[0].id, 'n29')
})

test('a link preview names the note, its first line and its notebook; a note not on this device has none', () => {
  const byId = new Map(notes.map((n) => [n.id, n]))
  const named = (id: string | null) => (id ? names[id] : '')
  const withText = {...notes[0], blocks: [{id: 'b', type: 'paragraph', content: [{type: 'text', value: 'Goals for the site.'}]}]}
  assert.deepEqual(linkPreview(new Map([['kick', withText]]), 'kick', named), {title: 'Harbor redesign: kickoff', excerpt: 'Goals for the site.', subtitle: 'Projects'})
  assert.deepEqual(linkPreview(new Map([['e', note('e', '', '2026-10-06', null)]]), 'e', named), {title: 'Untitled', excerpt: 'No text yet', subtitle: ''})
  assert.equal(linkPreview(byId, 'gone', named), null)
})
