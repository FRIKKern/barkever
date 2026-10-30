import {test} from 'node:test'
import assert from 'node:assert/strict'
import {baseFor, reconcile} from './merge.ts'
import {blockText, type Block, type Conflict} from '../lib/model.ts'
import {sign} from './sign.ts'
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

test('every unacked push shares one ifRevisionID, so only the first push carrying a new copy can have landed: a later one carrying it too was refused', () => {
  const made = copy('local-1~a', {title: 'Old'}, ['title'])
  const base = note('r1', 'T', [])
  const [first, second] = [note('r1', 'X', [], {conflicts: [made]}), note('r1', 'Y', [], {conflicts: [made]})]
  const theirs = note('r2', 'Z', [], {conflicts: [made]})
  for (const title of ['Y', 'Z']) assert.ok(everything(merged(base, [first, second], second, theirs)).includes(title), title)
  const out = merged(base, [first, second], first, theirs)
  assert.deepEqual([out?.title, out?.conflicts?.map((c) => c.title)], ['Z', ['Old']])
})

test('two proven pushes that disagree keep, field by field, what the server shows of them, and the base where it shows neither: nothing either side wrote is lost', () => {
  const [one, two] = [copy('local-1~a', {title: 'Old'}, ['title']), copy('local-2~a', {title: 'Older'}, ['title'])]
  const base = note('r1', 'T', [])
  const [first, second] = [note('r1', 'X', [], {tags: ['a'], conflicts: [one]}), note('r1', 'Y', [], {tags: ['b'], conflicts: [one, two]})]
  const out = merged(base, [first, second], {...second, title: 'T'}, note('r2', 'Y', [], {tags: ['z'], conflicts: [one, two]}))
  assert.deepEqual([out?.title, out?.conflicts?.map((c) => c.clash)], ['T', [['title'], ['title'], ['tags']]])
  for (const tags of ['["b"]', '["z"]']) assert.ok(everything(out).includes(tags), JSON.stringify(everything(out)))
})

test('only the push that proves it landed counts: an earlier refused push of mine never turns a later edit on top of the landed one into a copy', () => {
  const made = copy('local-1~a', {title: 'Old'}, ['title'])
  const base = note('r1', 'T', [])
  const [refused, landed] = [note('r1', 'X', []), note('r1', 'Y', [], {conflicts: [made]})]
  const out = merged(base, [refused, landed], landed, note('r2', 'Z', [], {conflicts: [made]}))
  assert.deepEqual([out?.title, out?.conflicts?.map((c) => c._key)], ['Z', ['local-1~a']])
})

test('a push whose reply was lost and that left no copy still proves it landed while the server carries its signature: Studio edits do not re-sign', () => {
  const base = note('r1', 'T0 R1', [])
  const lost = note('r1', 'A1', [], {by: 'dev-me.abc'})
  const mine = note('r1', 'T0 R1', [])
  const out = merged(base, [lost], mine, note('r3', 'R2', [], {by: 'dev-me.abc'}))
  assert.deepEqual([out?.title, out?.conflicts?.map((c) => c.title)], ['T0 R1', ['R2']])
})

test('a Studio edit keeps the last Barkever signature, so a push signed like the base proves nothing: my title back to the signed one survives', () => {
  const signed = sign(note('r0', 'Plan', []), ME).by
  const base = note('r1', 'Plan v2', [], {by: signed})
  const refused = sign(note('r1', 'Plan', []), ME)
  const out = merged(base, [refused], refused, note('r2', 'Plan v3', [], {by: signed}))
  for (const title of ['Plan', 'Plan v3']) assert.ok(everything(out).includes(title), JSON.stringify(everything(out)))
})

test('the block order comes from the push that proved it landed, not from a later refused one: a reorder made on the server after it survives', () => {
  const made = copy('local-1~a', {title: 'Old'}, ['title'])
  const [a, b, c] = [p('a', 'A'), p('b', 'B'), p('c', 'C')]
  const base = note('r1', 'T', [a, b, c])
  const landed = note('r1', 'T', [c, a, b], {conflicts: [made]})
  const refused = note('r1', 'T', [a, b, c])
  const out = merged(base, [landed, refused], landed, note('r3', 'T', [a, c, b], {conflicts: [made]}))
  assert.deepEqual(out?.body?.blocks.map((x) => x.id), ['a', 'c', 'b'])
})

test('a copy key the base already held proves nothing: it was on the server before my push', () => {
  const held = copy('local-1~a', {title: 'Old'}, ['title'])
  const base = note('r1', 'T', [], {conflicts: [held]})
  const refused = note('r1', 'X', [], {conflicts: [held]})
  const out = merged(base, [refused], refused, note('r2', 'Z', [], {conflicts: [held]}))
  for (const title of ['X', 'Z']) assert.ok(everything(out).includes(title), JSON.stringify(everything(out)))
})

test('a new copy key that never reached the server proves nothing', () => {
  const base = note('r1', 'T', [])
  const refused = note('r1', 'X', [], {conflicts: [copy('local-2~a', {title: 'Old'}, ['title'])]})
  const out = merged(base, [refused], refused, note('r2', 'Z', []))
  for (const title of ['X', 'Z']) assert.ok(everything(out).includes(title), JSON.stringify(everything(out)))
})

for (const title of ['Y', 'W'])
  test(`the first push carrying a new copy never reached the server and a later one carrying it landed: a part the server shows from any push is not mine to copy back (mine ${title})`, () => {
    const made = copy('local-1~a', {title: 'Old'}, ['title'])
    const base = note('r1', 'T', [], {by: 'me.0'})
    const [never, landed] = [note('r1', 'X', [], {by: 'me.1', conflicts: [made]}), note('r1', 'Y', [], {by: 'me.2', conflicts: [made]})]
    const out = merged(base, [never, landed], note('r1', title, [], {by: 'me.3', conflicts: [made]}), note('r3', 'Y', [], {by: 'B.9', tags: ['z'], conflicts: [made]}))
    assert.deepEqual([out?.title, out?.tags, out?.conflicts?.map((c) => c._key)], [title, ['z'], ['local-1~a']])
  })
