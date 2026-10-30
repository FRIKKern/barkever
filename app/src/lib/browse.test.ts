import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {toNote, toNotebook, type BpNote, type BpNotebook} from './note-docs.ts'
import {indexLinks} from './links.ts'
import {GRAPH, layoutGraph, wrapLabel} from './graph-layout.ts'
import {layoutMap} from './mini-map.ts'
import {shelve} from './notebooks.ts'
import {landing, openNote, parseSearch, scopeName, visibleNotes} from './scope.ts'
import {isBlank, type Library, type Note} from './model.ts'

const docs = readFileSync(new URL('../../../fixtures/notes.ndjson', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const lib: Library = {
  notes: docs.filter((d) => d._type === 'note').map((d) => toNote(d as BpNote)),
  notebooks: docs.filter((d) => d._type === 'notebook').map((d) => toNotebook(d as BpNotebook)),
}
const links = indexLinks(lib)
const note = (id: string, links: string[] = [], extra: Partial<Note> = {}): Note => ({id, title: id, notebook: 'nb', tags: [], blocks: [], links, updatedAt: '', rev: '', conflicts: [], gen: 0, ...extra})

test('backlinks come from links[] and body wikilinks, without self links or missing notes', () => {
  const l = indexLinks({notebooks: [], notes: [note('a', ['b', 'a', 'gone']), note('b'), note('c', [], {blocks: [{id: 'p', type: 'paragraph', content: [{type: 'wikilink', docId: 'b'}]}]})]})
  assert.deepEqual(l.outs('a'), ['b'])
  assert.deepEqual(l.backs('b'), ['a', 'c'])
  assert.equal(l.degree('b'), 2)
  assert.equal(l.total, 2)
})

test('the sitemap fixture: 3 in, 1 out, and a same-tag note that is not already linked', () => {
  assert.deepEqual(links.outs('fx-note-01'), ['fx-note-00'])
  assert.equal(links.backs('fx-note-01').length, 3)
  const shared = links.sharesTag('fx-note-01', 4)
  assert.ok(shared.length > 0)
  for (const id of shared) assert.ok(!links.outs('fx-note-01').includes(id) && !links.backs('fx-note-01').includes(id))
})

test('the graph puts backlinks left, links right, same tag above and below, all inside the frame', () => {
  const g = layoutGraph('fx-note-01', links)
  const at = new Map(g.nodes.map((n) => [n.key, n]))
  for (const id of links.backs('fx-note-01')) assert.ok(at.get(id)!.x < GRAPH.cx, id)
  for (const id of links.outs('fx-note-01')) assert.ok(at.get(id)!.x > GRAPH.cx, id)
  for (const n of g.nodes.filter((n) => n.kind === 'tagged')) assert.equal(n.x, GRAPH.cx)
  for (const n of g.nodes) assert.ok(n.x >= 0 && n.x <= GRAPH.W && n.y >= 0 && n.y <= GRAPH.H, n.key)
  assert.equal(new Set(g.nodes.map((n) => n.key)).size, g.nodes.length)
  assert.ok(g.edges.every((e) => at.has(e.a) && at.has(e.b)))
})

test('more than four backlinks fold into "+n more"', () => {
  const l = indexLinks({notebooks: [], notes: [note('hub'), ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => note(id, ['hub']))]})
  const g = layoutGraph('hub', l)
  assert.equal(g.nodes.filter((n) => n.kind === 'n').length, 3)
  assert.equal(g.nodes.find((n) => n.kind === 'more')?.label, '+3 more')
})

test('a lonely note says so', () => {
  assert.equal(layoutGraph('x', indexLinks({notebooks: [], notes: [note('x')]})).empty, true)
})

test('labels wrap to two lines and end in an ellipsis when cut', () => {
  assert.deepEqual(wrapLabel('Harbor redesign: wireframes', 16), ['Harbor redesign:', 'wireframes'])
  assert.deepEqual(wrapLabel('Article: Information architecture today', 16), ['Article:', 'Information…'])
})

test('the mini map gives every note in a notebook its own slot inside its box', () => {
  const map = layoutMap(lib, links)
  assert.equal(map.pos.size, lib.notes.length)
  assert.equal(new Set([...map.pos.values()].map((p) => `${p.x},${p.y}`)).size, lib.notes.length)
  for (const b of map.boxes) for (const id of b.notes) {
    const p = map.pos.get(id)!
    assert.ok(p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h, id)
  }
})

test('notebook scope includes its stack; colours are stable tokens', () => {
  const shelf = shelve(lib.notebooks)
  const work = visibleNotes(lib.notes, {nb: 'fx-nb-work'}, shelf).notes
  assert.ok(work.some((n) => n.notebook === 'fx-nb-projects') && work.some((n) => n.notebook === 'fx-nb-meetings'))
  assert.match(shelf.colour('fx-nb-projects'), /^var\(--nb-\d\)$/)
  assert.equal(shelf.colour(null), 'var(--c-faint)')
  assert.deepEqual(shelf.path('fx-nb-projects'), ['Work', 'Projects'])
  assert.ok(visibleNotes(lib.notes, {tag: 'harbor'}, shelf).notes.every((n) => n.tags.includes('harbor')))
  assert.ok(visibleNotes(lib.notes, {nb: 'fx-nb-home', q: 'harbor sitemap'}, shelf).notes.some((n) => n.id === 'fx-note-01'))
})

test('search params keep only non-empty strings, and view is tasks or nothing', () => {
  assert.deepEqual(parseSearch({nb: 'x', n: '', q: 3, tag: undefined}), {nb: 'x', tag: undefined, q: undefined, n: undefined, view: undefined, line: undefined})
  assert.deepEqual(parseSearch({view: 'tasks', line: 'b:2', n: 'a'}), {nb: undefined, tag: undefined, q: undefined, n: 'a', view: 'tasks', line: 'b:2'})
  assert.equal(parseSearch({view: 'board'}).view, undefined)
  assert.equal(parseSearch({line: ''}).line, undefined)
})

test('opening a note drops the board and the line, and keeps the list it came from', () => {
  assert.deepEqual(openNote({nb: 'x', q: 'y', n: 'a', line: 'b:0', view: 'tasks'}, 'c'), {nb: 'x', q: 'y', n: 'c', line: undefined, view: undefined})
  assert.deepEqual(openNote({tag: 't', n: 'a', line: 'b:0'}), {tag: 't', n: undefined, line: undefined, view: undefined})
  assert.equal(scopeName({view: 'tasks', nb: 'fx-nb-home'}, shelve(lib.notebooks)), 'Tasks')
})

test('a new note lands where you are and stays in the list it was made from', () => {
  const shelf = shelve(lib.notebooks)
  assert.deepEqual(landing({nb: 'fx-nb-projects', q: 'x'}, shelf), {notebook: 'fx-nb-projects', tags: [], search: {nb: 'fx-nb-projects', tag: undefined}})
  assert.deepEqual(landing({tag: 'harbor'}, shelf), {notebook: 'fx-nb-inbox', tags: ['harbor'], search: {nb: undefined, tag: 'harbor'}})
  assert.deepEqual(landing({nb: 'fx-nb-gone'}, shelf), {notebook: 'fx-nb-inbox', tags: [], search: {nb: 'fx-nb-inbox', tag: undefined}})
  assert.equal(landing({}, shelve([])), null)
  for (const s of [{tag: 'harbor'}, {nb: 'fx-nb-gone'}, {nb: 'fx-nb-work'}]) {
    const l = landing(s, shelf)!
    const made = note('new', [], {notebook: l.notebook, tags: l.tags})
    assert.ok(visibleNotes([made], l.search, shelf).notes.length === 1, JSON.stringify(s))
  }
})

test('a note is blank only with no title and no text, image or other content in the body', () => {
  const p = (text: string) => ({id: 'p', type: 'paragraph', content: text ? [{type: 'text', value: text}] : []})
  assert.equal(isBlank(note('x', [], {title: '', blocks: [p('')]})), true)
  assert.equal(isBlank(note('x', [], {title: ' ', blocks: [p(' '), {id: 'l', type: 'list', items: [[]]}]})), true)
  assert.equal(isBlank(note('x', [], {title: 'Hi', blocks: [p('')]})), false)
  assert.equal(isBlank(note('x', [], {title: '', blocks: [p('words')]})), false)
  assert.equal(isBlank(note('x', [], {title: '', blocks: [{id: 'i', type: 'image'}]})), false)
})
