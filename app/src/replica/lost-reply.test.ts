import {test} from 'node:test'
import assert from 'node:assert/strict'
import {baseFor, reconcile} from './merge.ts'
import {blockText, type Block, type Conflict} from '../lib/model.ts'
import type {NoteDoc as Note} from './note.ts'

const AT = '2026-10-29T12:00:00.000Z'
const ME = 'dev-me'
const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const note = (rev: string, title: string, blocks: Block[], extra: Partial<Note> = {}): Note => ({_id: 'n1', _type: 'note', _rev: rev, title, tags: [], links: [], body: {blocks}, ...extra})
const copy = (key: string, part: Partial<Conflict>, clash: string[]): Conflict => ({_key: key, by: 'B', at: AT, clash, ...part})
const everything = (n: Note | null) => (n ? [n, ...(n.conflicts ?? [])].flatMap((v) => [v.title ?? '', JSON.stringify(v.tags ?? null), ...(v.body?.blocks ?? []).map(blockText)]) : [])
const merged = (base: Note, sent: Note[], mine: Note, theirs: Note) => reconcile(baseFor(base, sent, theirs), mine, theirs, AT, ME)

test('a push whose reply was lost landed, another writer then changed what it set, and I went back to the old value: my value survives', () => {
  const made = copy('local-1~a', {tags: ['r2']}, ['tags'])
  const base = note('r3', 'T', [], {tags: ['r2']})
  const lost = note('r3', 'T', [], {tags: ['b2'], conflicts: [made]})
  const mine = note('r3', 'T', [], {tags: ['r2'], conflicts: []})
  const theirs = note('r5', 'T', [], {tags: ['b2', 'r3'], conflicts: [made]})
  const out = merged(base, [lost], mine, theirs)
  assert.deepEqual(out?.tags, ['r2'])
  assert.ok(everything(out).includes('["b2","r3"]'), JSON.stringify(everything(out)))
})

test('a copy key made from a server revision proves nothing: another device makes the same key from the same revision', () => {
  const shared = copy('r1~x', {body: {blocks: [p('s0', 'S0 R1')]}}, ['body:s0'])
  const base = note('r1', 'T', [p('s0', 'S0 R1')])
  const refused = note('r1', 'T', [p('s0', 'S0 B1')], {conflicts: [shared]})
  const theirs = note('r2', 'T', [p('s0', 'A1 S0')], {conflicts: [shared]})
  assert.ok(everything(merged(base, [refused], refused, theirs)).includes('S0 B1'))
})

test('a block id my push holds proves nothing: a block deleted on the server can come back under its old id from another device', () => {
  const base = note('r1', 'T', [])
  const refused = note('r1', 'T', [p('s0', 'S0 C1')])
  const theirs = note('r3', 'T', [p('s0', 'B2 S0')])
  assert.ok(everything(merged(base, [refused], refused, theirs)).includes('S0 C1'))
})

test('two unacked pushes carry the same new copy, so one landed, but which one is unknown: a part they disagree on keeps its base', () => {
  const made = copy('local-1~a', {title: 'Old'}, ['title'])
  const base = note('r1', 'T', [])
  const [first, second] = [note('r1', 'X', [], {conflicts: [made]}), note('r1', 'Y', [], {conflicts: [made]})]
  const theirs = note('r2', 'Z', [], {conflicts: [made]})
  for (const mine of [first, second]) assert.ok(everything(merged(base, [first, second], mine, theirs)).includes(mine.title!), mine.title)
})

test('only the push that proves it landed counts: an earlier refused push of mine never turns a later edit on top of the landed one into a copy', () => {
  const made = copy('local-1~a', {title: 'Old'}, ['title'])
  const base = note('r1', 'T', [])
  const [refused, landed] = [note('r1', 'X', []), note('r1', 'Y', [], {conflicts: [made]})]
  const out = merged(base, [refused, landed], landed, note('r2', 'Z', [], {conflicts: [made]}))
  assert.deepEqual([out?.title, out?.conflicts?.map((c) => c._key)], ['Z', ['local-1~a']])
})
