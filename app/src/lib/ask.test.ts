import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {toNote, type BpNote} from './note-docs.ts'
import {ASK_NOTES, NOTE_CHARS, askWords, asked, parts, pickNotes} from './ask.ts'
import type {Note} from './model.ts'

const fixtures = readFileSync(new URL('../../../fixtures/notes.ndjson', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((d) => d._type === 'note').map((d) => toNote(d as BpNote))
const titles = (q: string) => pickNotes(fixtures, q).map((n) => n.title)

test('question words drop short and common words, in English and Norwegian, and repeats', () => {
  assert.deepEqual(askWords('What did we decide about the carousel, the CAROUSEL?'), ['decide', 'carousel'])
  assert.deepEqual(askWords('Hva har vi bestemt om karusellen?'), ['bestemt', 'karusellen'])
  assert.deepEqual(askWords('?! …'), [])
  const every =
    'the and for are was were what when where which who whom why how did does our you your his her its their with from that this have has had ' +
    'not but can will would should about into over than then them they there these those been any all some just also only very more most ' +
    'som det den har var hva når hvor hvem hvorfor hvordan med fra til ikke men kan vil skal blir ble jeg dere han hun meg oss deg seg ' +
    'sin sitt sine min mitt mine vår vårt våre hadde'
  assert.deepEqual(askWords(every), [])
})

test('Ask reads the notes J03 search finds for each question word, typos included', () => {
  assert.deepEqual(titles('What did we decide about the carousel?').sort(), ['Harbor redesign: wireframes', 'Notes: Small Teams', 'Weekly sync, week 41'])
  assert.equal(titles('When is my dentist appointment?')[0], 'Book the dentist')
  assert.equal(titles('Whats our sourdoug hydraton?')[0], 'Recipes: sourdough')
})

test('a question no note matches picks nothing, so nothing is sent', () => {
  assert.deepEqual(titles('zebra xylophone'), [])
  assert.deepEqual(titles('what is the and'), [])
})

test('Ask reads at most a few notes, best score first, then newest', () => {
  const picked = pickNotes(fixtures, 'harbor quarry lighthouse weekly')
  assert.equal(picked.length, ASK_NOTES)
  const note = (id: string, title: string, updatedAt: string): Note => ({id, title, notebook: null, tags: [], blocks: [], links: [], updatedAt, rev: '', conflicts: [], gen: 0})
  const tie = [note('a', 'harbor', '2026-01-01'), note('b', 'harbor', '2026-02-01'), note('c', 'harbor quarry', '2025-01-01')]
  assert.deepEqual(pickNotes(tie, 'harbor quarry').map((n) => n.id), ['c', 'b', 'a'])
  const rare = [note('common', 'harbor sync', '2026-03-01'), note('x', 'sync', '2026-01-01'), note('y', 'sync', '2026-01-01'), note('only', 'harbor', '2025-01-01')]
  assert.deepEqual(pickNotes(rare, 'harbor sync').map((n) => n.id), ['common', 'only', 'x', 'y'])
  assert.deepEqual(pickNotes([note('old', 'alpha', '2025-01-01'), note('new', 'beta', '2026-01-01')], 'alpha beta').map((n) => n.id), ['new', 'old'])
})

test('a note goes out as id, title and text, cut at the per-note cap', () => {
  const sync = fixtures.find((n) => n.title === 'Weekly sync, week 41')!
  const a = asked(sync)
  assert.deepEqual(Object.keys(a), ['id', 'title', 'text'])
  assert.match(a.text, /Decision: drop the carousel\./)
  const long = {...sync, blocks: [{id: 'p', type: 'paragraph', content: [{type: 'text', value: 'x'.repeat(NOTE_CHARS + 50)}]}]}
  assert.equal(asked(long).text.length, NOTE_CHARS)
})

test('an answer splits into text and numbered citations', () => {
  assert.deepEqual(parts('Dropped [1], logged [2].'), [{text: 'Dropped '}, {cite: 1}, {text: ', logged '}, {cite: 2}, {text: '.'}])
  assert.deepEqual(parts('No citation.'), [{text: 'No citation.'}])
})
