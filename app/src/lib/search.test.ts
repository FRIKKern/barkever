import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {bulkNotes} from '../../e2e/bulk.ts'
import {toNote, type BpNote} from './note-docs.ts'
import {find, terms, within} from './search.ts'
import type {Note} from './model.ts'

const fixtures = readFileSync(new URL('../../../fixtures/notes.ndjson', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((d) => d._type === 'note').map((d) => toNote(d as BpNote))
const ids = (notes: Note[]) => notes.map((n) => n.id)
const titles = (q: string) => find(fixtures, q).notes.map((n) => n.title)

test('a word in the title or only in the body finds the note', () => {
  assert.ok(titles('sitemap').includes('Harbor redesign: sitemap'))
  assert.deepEqual(titles('carousel').sort(), ['Harbor redesign: wireframes', 'Weekly sync, week 41'])
  assert.deepEqual(titles('hydration'), ['Recipes: sourdough'])
})

test('every word must match, in any order, and a prefix matches as you type', () => {
  assert.equal(titles('sitemap harbor')[0], 'Harbor redesign: sitemap')
  assert.ok(titles('wirefr').includes('Harbor redesign: wireframes'))
  assert.deepEqual(titles('harbor xyzzy'), [])
})

test('one typo from five letters, two from nine, a swap counts as one, the first letter must hold', () => {
  assert.equal(titles('sourdoug')[0], 'Recipes: sourdough')
  assert.deepEqual(titles('hydraton'), ['Recipes: sourdough'])
  assert.deepEqual(titles('yhdration'), [])
  assert.deepEqual(titles('hdyration'), ['Recipes: sourdough'])
  assert.deepEqual(titles('hyrdation'), ['Recipes: sourdough'])
  assert.equal(titles('wierframes')[0], 'Harbor redesign: wireframes')
  assert.ok(titles('wirefarmse').includes('Harbor redesign: wireframes'))
  assert.deepEqual(titles('ydration'), ['Recipes: sourdough'])
  assert.deepEqual(titles('fsh'), [])
  assert.equal(within('kitten', 'sitting', 2), false)
  assert.equal(within('kitten', 'sitting', 3), true)
  assert.equal(within('abcd', 'abdc', 1), true)
})

test('exact title, exact body, typo in title, typo in body, then newest first', () => {
  const notes = [
    {...fixtures[0], id: 'body-new', title: 'Other', blocks: [{id: 'p', type: 'paragraph', content: [{type: 'text', value: 'quarry plans'}]}], tags: [], updatedAt: '2026-10-03'},
    {...fixtures[0], id: 'title-old', title: 'Quarry', blocks: [], tags: [], updatedAt: '2026-10-01'},
    {...fixtures[0], id: 'typo', title: 'Quary', blocks: [], tags: [], updatedAt: '2026-10-04'},
    {...fixtures[0], id: 'title-new', title: 'Quarry two', blocks: [], tags: [], updatedAt: '2026-10-02'},
  ]
  assert.deepEqual(ids(find(notes, 'quarry').notes), ['title-new', 'title-old', 'body-new', 'typo'])
  assert.deepEqual(ids(find(notes, 'quarr').notes), ['title-new', 'title-old', 'body-new', 'typo'])
  assert.deepEqual(ids(find(notes, 'qurry').notes), ['typo', 'title-new', 'title-old', 'body-new'])
})

test('the words a typo matched are marked, so the list can highlight them', () => {
  const {marks} = find(fixtures, 'hyrdation')
  assert.deepEqual(marks, ['hyrdation', 'hydration'])
  assert.deepEqual(terms('#Harbor  Sitemap '), ['harbor', 'sitemap'])
})

test('an edited note is found by its new words; untouched notes keep their cached index', () => {
  const [a, b] = fixtures
  assert.deepEqual(ids(find([a, b], 'zebra').notes), [])
  const edited = {...a, title: 'Zebra crossing'}
  assert.deepEqual(ids(find([edited, b], 'zebra').notes), [a.id])
  assert.deepEqual(ids(find([edited, b], 'zebre').notes), [a.id])
  assert.deepEqual(ids(find([a, b], 'zebre').notes), [])
})

test('5,000 notes: the index builds once, then every query, typos included, runs inside the 150 ms budget', () => {
  const notes = [...fixtures, ...bulkNotes(5000 - fixtures.length).map((d) => toNote(d))]
  assert.equal(notes.length, 5000)
  const t0 = performance.now()
  find(notes, 'warm')
  const build = performance.now() - t0
  const queries = ['harbor', 'sourdough', 'garlik', 'wierframes', 'xyzzy', 'ta', 'harbor sitemap', 'bulk-alpha', 'stone', 'calm navigation']
  const median = (q: string) => {
    const ms = Array.from({length: 5}, () => {
      const t = performance.now()
      find(notes, q)
      return performance.now() - t
    }).sort((a, b) => a - b)
    return ms[2]
  }
  const ms = queries.map(median)
  const worst = Math.max(...ms)
  console.log(`search at 5,000 notes in node: index ${build.toFixed(0)} ms once; median per query ${queries.map((q, i) => `${q} ${ms[i].toFixed(1)}`).join(' · ')}`)
  assert.ok(worst < 150, `slowest query median ${worst.toFixed(1)} ms`)
})
