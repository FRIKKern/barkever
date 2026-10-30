import {test} from 'node:test'
import assert from 'node:assert/strict'
import {baseFor, mergeLocal, mergeNote, reconcile} from './merge.ts'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc as Note} from './note.ts'

const AT = '2026-10-29T12:00:00.000Z'
const ME = 'dev-me'
const p = (id: string, text: string, links: string[] = []): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}, ...links.map((docId) => ({type: 'wikilink', docId}))]})
const note = (rev: string | undefined, title: string, blocks: Block[], extra: Partial<Note> = {}): Note => ({_id: 'x', _type: 'note', _rev: rev, title, tags: [], links: [], body: {blocks}, ...extra})
const texts = (n: Note | null) => n?.body?.blocks.map((b) => `${b.id}:${blockText(b)}`)
const rev = (k: string) => k.split('~')[0]
const everything = (n: Note) => [n, ...(n.conflicts ?? [])].flatMap((v) => [v.title ?? '', ...(v.body?.blocks ?? []).map(blockText)]).join(' | ')

test('bug 1: a save from a canvas that never showed the merged text keeps both, never overwrites; the copy it typed from goes', () => {
  const replica = note('R2', 'T', [p('a', 'Plan OFF-B'), p('b', 'two')], {conflicts: [{_key: 'R1', at: AT, title: 'T', body: {blocks: [p('a', 'Plan A1'), p('b', 'two')]}, clash: ['body:a']}]})
  const shown = [p('a', 'Plan A1'), p('b', 'two')]
  const typed = [p('a', 'Plan A1 more'), p('b', 'two')]
  const out = mergeLocal(replica, {body: {blocks: shown}}, {body: {blocks: typed}}, AT, 'local-1', ME, null)
  assert.deepEqual(texts(out), ['a:Plan A1 more', 'b:two'])
  assert.deepEqual(out.conflicts?.map((c) => [rev(c._key), c.clash, blockText(c.body!.blocks[0])]), [['local-1', ['body:a'], 'Plan OFF-B']])
  for (const t of ['Plan A1 more', 'Plan OFF-B']) assert.ok(everything(out).includes(t), t)
})

test('bug 1: a stale canvas never reverts a block it did not touch', () => {
  const replica = note('R2', 'T', [p('a', 'one'), p('b', 'two, edited elsewhere'), p('c', 'new elsewhere')])
  const out = mergeLocal(replica, {body: {blocks: [p('a', 'one'), p('b', 'two')]}}, {body: {blocks: [p('a', 'one!'), p('b', 'two')]}}, AT, 'local-1', ME, null)
  assert.deepEqual(texts(out), ['a:one!', 'b:two, edited elsewhere', 'c:new elsewhere'])
  assert.equal(out.conflicts, undefined)
})

test('bug 1: a canvas in step with the replica just saves, no conflict', () => {
  const replica = note('R2', 'T', [p('a', 'one'), p('b', 'two')])
  const out = mergeLocal(replica, {body: {blocks: replica.body!.blocks}}, {body: {blocks: [p('a', 'one'), p('n', 'new'), p('b', 'two!')]}}, AT, 'local-1', ME, null)
  assert.deepEqual(texts(out), ['a:one', 'n:new', 'b:two!'])
  assert.equal(out.conflicts, undefined)
})

test('bug 1: a canvas that deletes a block someone else just edited keeps the edit', () => {
  const replica = note('R2', 'T', [p('a', 'one'), p('b', 'two, edited elsewhere')])
  const out = mergeLocal(replica, {body: {blocks: [p('a', 'one'), p('b', 'two')]}}, {body: {blocks: [p('a', 'one')]}}, AT, 'local-1', ME, null)
  assert.ok(everything(out).includes('two, edited elsewhere'))
})

test('the journal replays a save twice without a conflict', () => {
  const replica = note('R0', 'T', [p('a', 'one'), p('b', 'two')])
  const once = mergeLocal(replica, {body: {blocks: replica.body!.blocks}}, {body: {blocks: [p('a', 'one!'), p('b', 'two')]}}, AT, 'local-1', ME, null)
  const twice = mergeLocal(once, {body: {blocks: replica.body!.blocks}}, {body: {blocks: [p('a', 'one!'), p('b', 'two')]}}, AT, 'local-2', ME, null)
  assert.deepEqual(texts(twice), ['a:one!', 'b:two'])
  assert.equal(twice.conflicts, undefined)
})

test('bug 4: the echo of my own push, arriving before its reply, is no conflict', () => {
  const base = note('R0', 'T', [p('b1', 'Hello')])
  const pushed = note('R0', 'T', [p('b1', 'Hello wor')])
  const echo = note('R1', 'T', [p('b1', 'Hello wor')])
  const mine = note('R0', 'T', [p('b1', 'Hello world')])
  const out = reconcile(baseFor(base, [pushed], echo), mine, echo, AT, ME)!
  assert.deepEqual(texts(out), ['b1:Hello world'])
  assert.equal(out.conflicts, undefined)
})

test('bug 4: the echo of my own create, arriving before its reply, is no conflict', () => {
  const pushed = note(undefined, 'J0', [p('p0', '')])
  const created = note('R1', 'J0', [p('p0', '')])
  const mine = note(undefined, 'J01 capture', [p('p0', '')])
  const out = reconcile(baseFor(null, [pushed], created), mine, created, AT, ME)!
  assert.equal(out.title, 'J01 capture')
  assert.equal(out.conflicts, undefined)
})

test('a delete wins over its own create still in flight, though Barkpark stores the empty title as null', () => {
  const pushed = note(undefined, '', [p('p0', '')])
  const created = {...note('R1', '', [p('p0', '')]), title: null as unknown as string}
  assert.equal(baseFor(null, [pushed], created), created)
  assert.equal(reconcile(baseFor(null, [pushed], created), null, created, AT, ME), null)
  assert.equal(reconcile(null, null, created, AT, ME), created)
})

test('bug 4: a foreign write that is not what I pushed still merges three-way', () => {
  const base = note('R0', 'T', [p('b1', 'Hello')])
  const theirs = note('R1', 'T', [p('b1', 'Hello from B')])
  assert.equal(baseFor(base, [note('R0', 'T', [p('b1', 'Hello wor')])], theirs), base)
  assert.deepEqual(reconcile(baseFor(base, [], theirs), note('R0', 'T', [p('b1', 'Hello world')]), theirs, AT, ME)?.conflicts?.map((c) => c.clash), [['body:b1']])
})

test('bug 5: links follow the merged body and never clash', () => {
  const b = note('R0', 'T', [p('b1', 'a'), p('b2', 'b')])
  const m = note('R0', 'T', [p('b1', 'a', ['n1']), p('b2', 'b')], {links: [{_ref: 'n1', _key: 'n1', _type: 'reference'}]})
  const t = note('R1', 'T', [p('b1', 'a'), p('b2', 'b', ['n2'])], {links: [{_ref: 'n2', _key: 'n2', _type: 'reference'}]})
  const out = mergeNote(b, m, t, AT, ME)
  assert.deepEqual(out.links?.map((l) => l._ref).sort(), ['n1', 'n2'])
  assert.equal(out.conflicts, undefined)
})

test('bug 5: links stay as they were when the merged body links the same notes', () => {
  const links = [{_ref: 'n1'}]
  const b = note('R0', 'T', [p('b1', 'a', ['n1'])], {links})
  const out = mergeNote(b, {...b, title: 'mine'}, {...b, _rev: 'R1', body: {blocks: [p('b1', 'a!', ['n1'])]}}, AT, ME)
  assert.equal(out.links, links)
})

test('bug 6: catch-up through two server revisions keeps both, and a third equal to one adds nothing', () => {
  const r0 = note('R0', 'T', [p('a', 'one')])
  const mine = note('R0', 'T', [p('a', 'one [A1]')])
  const r1 = note('R1', 'T', [p('a', 'one [S1]')])
  const r2 = note('R2', 'T', [p('a', 'one [S1][S2]')])
  const r3 = note('R3', 'T', [p('a', 'one [S1]')])
  const first = mergeNote(r0, mine, r1, AT, ME)
  const second = mergeNote(r1, first, r2, AT, ME)
  assert.deepEqual(second.conflicts?.map((c) => [rev(c._key), blockText(c.body!.blocks[0])]), [['R1', 'one [S1]'], ['R2', 'one [S1][S2]']])
  assert.deepEqual(mergeNote(r2, second, r3, AT, ME).conflicts?.map((c) => rev(c._key)), ['R1', 'R2'])
  assert.equal(blockText(second.body!.blocks[0]), 'one [A1]')
})

test('bug 6: a copy kept before writers were signed is never dropped', () => {
  const r1 = note('R1', 'T', [p('a', 'one [S1]')])
  const shared = {_key: 'R1', at: AT, title: 'T', body: r1.body, clash: ['body:a']}
  const local = {_key: 'local-1', at: AT, title: 'T', body: {blocks: [p('a', 'kept locally')]}, clash: ['body:a']}
  const mine = note('R1', 'T', [p('a', 'one [A1]')], {conflicts: [shared, local]})
  const r2 = note('R2', 'T', [p('a', 'one [S1][S2]')], {conflicts: [shared]})
  const out = mergeNote(r1, mine, r2, AT, ME)
  assert.deepEqual(out.conflicts?.map((c) => rev(c._key)), ['R1', 'local-1', 'R2'])
})

test('bug 6: a later revision that leaves my block alone keeps the earlier copy', () => {
  const r0 = note('R0', 'T', [p('a', 'one'), p('b', 'two')])
  const first = mergeNote(r0, note('R0', 'T', [p('a', 'one [A1]'), p('b', 'two')]), note('R1', 'T', [p('a', 'one [S1]'), p('b', 'two')]), AT, ME)
  const second = mergeNote(note('R1', 'T', [p('a', 'one [S1]'), p('b', 'two')]), first, note('R2', 'T', [p('a', 'one [S1]'), p('b', 'two [S2]')]), AT, ME)
  assert.deepEqual(second.conflicts?.map((c) => rev(c._key)), ['R1'])
  assert.deepEqual(texts(second), ['a:one [A1]', 'b:two [S2]'])
})

test('a block I made in a push whose reply was lost, then deleted, stays deleted after another writer builds on that push', () => {
  const r1 = note('r1', 'T', [p('a', 'one')])
  const s1 = note('r1', 'T', [p('a', 'one'), p('n', 'new')], {by: ME})
  const mine = note('r1', 'T', [p('a', 'one')], {by: ME})
  const r3 = note('r3', 'T2', [p('a', 'one'), p('n', 'new')], {by: 'B'})
  assert.deepEqual(texts(reconcile(baseFor(r1, [s1], r3), mine, r3, AT, ME)), ['a:one'])
})

test('the same, after a retry sent the note again: every unacked push counts', () => {
  const r1 = note('r1', 'T', [p('a', 'one')])
  const s1 = note('r1', 'T', [p('a', 'one'), p('n', 'new')], {by: ME})
  const s2 = note('r1', 'T', [p('a', 'one')], {by: ME})
  const r3 = note('r3', 'T2', [p('a', 'one'), p('n', 'new')], {by: 'B'})
  assert.deepEqual(texts(reconcile(baseFor(r1, [s1, s2], r3), s2, r3, AT, ME)), ['a:one'])
})

test('a copy I dismissed after a push whose reply was lost stays dismissed', () => {
  const c = {_key: 'k~1', by: 'C', at: AT, title: 'T', body: {blocks: [p('a', 'theirs')]}, clash: ['body:a']}
  const r1 = note('r1', 'T', [p('a', 'one')])
  const s1 = note('r1', 'T', [p('a', 'one')], {by: ME, conflicts: [c]})
  const mine = note('r1', 'T', [p('a', 'one')], {by: ME, conflicts: []})
  const r3 = note('r3', 'T2', [p('a', 'one')], {by: 'B', conflicts: [c]})
  assert.deepEqual(reconcile(baseFor(r1, [s1], r3), mine, r3, AT, ME)?.conflicts ?? [], [])
})
