import {test} from 'node:test'
import assert from 'node:assert/strict'
import {collapse, mergeNote, reconcile, same} from './merge.ts'
import {dismiss, keep} from './resolve.ts'
import {blockText, type Block, type Conflict} from '../lib/model.ts'
import {groups} from '../lib/versions.ts'
import type {NoteDoc as Note} from './note.ts'

const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const at = (s: number) => new Date(Date.parse('2026-10-29T12:00:00.000Z') + s * 1000).toISOString()
const copy = (key: string, s: number, by: string, clash: string[], title: string, blocks: Block[]): Conflict => ({_key: key, by, at: at(s), title, body: {blocks}, clash})
const texts = (n: Note) => n.body!.blocks.map((b) => `${b.id}:${blockText(b)}`)
const keepOn = (n: Note, key: string) => keep(n, key, n, at(9), 'local-k', 'dev-me')
const main: Note = {_id: 'n', _type: 'note', _rev: 'r5', title: 'Main', tags: [], links: [], body: {blocks: [p('a', 'one'), p('b', 'two')]}}

test('identical copies collapse to the earliest, and a copy the main already shows goes', () => {
  const k1 = copy('k1', 1, 'A', ['body:a'], 'x', [p('a', 'A text')])
  const k2 = copy('k2', 2, 'B', ['body:a'], 'y', [p('a', 'A text')])
  const k3 = copy('k3', 3, 'A', ['body:a'], 'Main', [p('a', 'one')])
  const k4 = copy('k4', 4, 'A', ['title', 'body:a'], 'Main', [p('a', 'one!')])
  assert.deepEqual(collapse([k2, k1, k3, k4], main).map((c) => c._key), ['k1', 'k4'])
})

test('Keep this puts the copy’s clashing parts in the main and removes only that copy', () => {
  const k1 = copy('k1', 1, 'A', ['title', 'body:b'], 'A title', [p('a', 'ignored'), p('b', 'A two'), p('c', 'not clashing')])
  const k2 = copy('k2', 2, 'B', ['body:a'], 'Main', [p('a', 'B one')])
  const out = keepOn({...main, conflicts: [k1, k2]}, 'k1')
  assert.equal(out.title, 'A title')
  assert.deepEqual(texts(out), ['a:one', 'b:A two'])
  assert.deepEqual(out.conflicts?.map((c) => c._key), ['k2'])
})

test('Keep this brings back a block the copy holds and drops one it deleted', () => {
  const back = copy('k1', 1, 'A', ['body:n'], 'Main', [p('a', 'one'), p('n', 'new in A'), p('b', 'two')])
  assert.deepEqual(texts(keepOn({...main, conflicts: [back]}, 'k1')), ['a:one', 'n:new in A', 'b:two'])
  const gone = copy('k2', 1, 'A', ['body:b'], 'Main', [p('a', 'one')])
  assert.deepEqual(texts(keepOn({...main, conflicts: [gone]}, 'k2')), ['a:one'])
})

test('Keep this folds other copies of the same text into the new main', () => {
  const k1 = copy('k1', 1, 'A', ['body:a'], 'Main', [p('a', 'same')])
  const k2 = copy('k2', 2, 'B', ['body:a'], 'Main', [p('a', 'same')])
  const out = keepOn({...main, conflicts: [k1, k2]}, 'k2')
  assert.deepEqual(texts(out), ['a:same', 'b:two'])
  assert.deepEqual(out.conflicts, [])
})

test('Dismiss removes one copy, and the removal wins a merge with a device that still holds it', () => {
  const k1 = copy('k1', 1, 'A', ['body:a'], 'Main', [p('a', 'A one')])
  const k2 = copy('k2', 2, 'B', ['body:a'], 'Main', [p('a', 'B one')])
  const base = {...main, conflicts: [k1, k2]}
  const mine = dismiss(base, 'k1')
  assert.deepEqual(mine.conflicts?.map((c) => c._key), ['k2'])
  const theirs = {...base, _rev: 'r6', title: 'Renamed elsewhere'}
  const out = mergeNote(base, mine, theirs, at(9), 'me')
  assert.equal(out.title, 'Renamed elsewhere')
  assert.deepEqual(out.conflicts?.map((c) => c._key), ['k2'])
})

test('versions group by writer and parts, newest first, the rest folded', () => {
  const g = groups([
    copy('k1', 1, 'A', ['body:a'], 'T', [p('a', 'A1')]),
    copy('k2', 2, 'B', ['body:a'], 'T', [p('a', 'B1')]),
    copy('k3', 3, 'A', ['body:a'], 'T', [p('a', 'A2')]),
    copy('k4', 4, 'A', ['title'], 'A title', []),
  ])
  assert.deepEqual(g.map((x) => [x.latest._key, x.earlier.map((c) => c._key)]), [['k4', []], ['k3', ['k1']], ['k2', []]])
  const joined = groups([copy('k5', 5, 'A', ['title', 'body:a'], 'A both', [p('a', 'A3')]), ...g.flatMap((x) => [x.latest, ...x.earlier])])
  assert.deepEqual(joined.map((x) => [x.latest._key, x.earlier.map((c) => c._key)]), [['k5', ['k4', 'k3', 'k1']], ['k2', []]])
})

test('Keep this over a main that moved since it was shown keeps the moved text as a copy', () => {
  const k1 = copy('k1', 1, 'C', ['body:a'], 'Main', [p('a', 'copy text')])
  const moved = {...main, body: {blocks: [p('a', 'B typed this a moment ago'), p('b', 'two')]}, conflicts: [k1]}
  const out = keep(moved, 'k1', main, at(9), 'local-k', 'dev-me')
  assert.deepEqual(texts(out), ['a:copy text', 'b:two'])
  assert.deepEqual(out.conflicts?.map((c) => [c._key.split('~')[0], blockText(c.body!.blocks[0])]), [['local-k', 'B typed this a moment ago']])
})

const local = () => `local-${crypto.randomUUID()}~x`
const shuffled = <T>(xs: T[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)
const rounds = <T>(make: () => T) => new Set(Array.from({length: 50}, () => JSON.stringify(make()))).size

test('two copies made in the same millisecond show the same latest run after run, whatever their random keys', () => {
  const shown = () => {
    const g = groups(shuffled([copy(local(), 1, 'A', ['body:a'], 'T', [p('a', 'A1')]), copy(local(), 1, 'A', ['body:a'], 'T', [p('a', 'A2')])]))
    return g.map((x) => [blockText(x.latest.body!.blocks[0]), x.earlier.map((c) => blockText(c.body!.blocks[0]))])
  }
  assert.equal(rounds(shown), 1)
  assert.deepEqual(shown(), [['A2', ['A1']]])
})

test('two lanes made in the same millisecond come in the same order run after run', () => {
  const order = () => groups(shuffled([copy(local(), 1, 'A', ['body:a'], 'T', [p('a', 'A1')]), copy(local(), 1, 'B', ['body:a'], 'T', [p('a', 'B1')])])).map((x) => x.latest.by)
  assert.equal(rounds(order), 1)
})

test('identical copies made in the same millisecond collapse to the same writer run after run', () => {
  const kept = () => collapse(shuffled([copy(local(), 1, 'A', ['body:a'], 'x', [p('a', 'same')]), copy(local(), 1, 'B', ['body:a'], 'x', [p('a', 'same')])]), main).map((c) => c.by)
  assert.equal(rounds(kept), 1)
})

test('Keep this returns copies already collapsed against its new main, with the kept copy gone', () => {
  const k1 = copy('k1', 1, 'A', ['body:a'], 'Main', [p('a', 'same')])
  const k2 = copy('k2', 2, 'B', ['body:a'], 'Main', [p('a', 'same')])
  const k3 = copy('k3', 3, 'C', ['body:b'], 'Main', [p('b', 'C two')])
  const k4 = copy('k4', 4, 'D', ['title'], 'D title', [])
  for (const key of ['k1', 'k2', 'k3', 'k4']) {
    const out = keepOn({...main, conflicts: [k1, k2, k3, k4]}, key)
    assert.deepEqual(collapse(out.conflicts ?? [], out), out.conflicts ?? [], key)
    assert.ok(!out.conflicts?.some((c) => c._key === key), key)
  }
})

test('copy order edge forms: no copies, one copy, an empty time, and words compared by code unit, not by locale', () => {
  assert.deepEqual(groups([]), [])
  assert.deepEqual(collapse([], main), [])
  const one = copy('k1', 1, 'A', ['body:a'], 'T', [p('a', 'A1')])
  assert.deepEqual(groups([one]), [{latest: one, earlier: []}])
  const blank = {...copy('k0', 0, 'A', ['body:a'], 'T', [p('a', 'A0')]), at: ''}
  assert.deepEqual(groups([blank, one]).map((x) => [x.latest._key, x.earlier.map((c) => c._key)]), [['k1', ['k0']]])
  const latest = () => blockText(groups(shuffled([copy(local(), 1, 'A', ['body:a'], 'T', [p('a', 'z')]), copy(local(), 1, 'A', ['body:a'], 'T', [p('a', 'é')])]))[0].latest.body!.blocks[0])
  assert.equal(rounds(latest), 1)
  assert.equal(latest(), 'é')
})

test('Keep this removes the kept copy even when the main moved since it was shown and the copy holds the shown words', () => {
  const moved = {...main, _rev: 'r6', title: 'Moved', body: {blocks: [p('a', 'one moved'), p('b', 'two')]}}
  for (const k1 of [copy('k1', 1, 'C', ['body:a'], 'Main', [p('a', 'one')]), copy('k1', 1, 'C', ['title'], 'Main', [])]) {
    const out = keep({...moved, conflicts: [k1]}, 'k1', main, at(9), 'local-k', 'dev-me')
    assert.ok(!out.conflicts?.some((c) => c._key === 'k1'), k1.clash[0])
  }
})

test('copies identical but for their key keep one latest whatever the order', () => {
  const twin = (key: string) => copy(key, 1, 'A', ['body:a'], 'T', [p('a', 'x')])
  const latest = () => groups(shuffled([twin('local-b~1'), twin('local-a~1')]))[0].latest._key
  assert.equal(rounds(latest), 1)
  assert.equal(latest(), 'local-b~1')
})

type Form = [part: string, values: unknown[], set: (n: Note, v: unknown) => Note, get: (n: Note | Conflict) => unknown]
const blockAt = (id: string) => (n: Note | Conflict) => n.body?.blocks.find((b) => b.id === id)
const forms: Form[] = [
  ['title', ['Main', 'Moved', 'Copy'], (n, v) => ({...n, title: v as string}), (n) => n.title],
  ['tags', [['x'], ['y'], []], (n, v) => ({...n, tags: v as string[]}), (n) => n.tags],
  ['notebook', [{_ref: 'nb1'}, {_ref: 'nb2'}, null], (n, v) => ({...n, notebook: (v as Note['notebook']) ?? undefined}), (n) => n.notebook],
  ['body:a', [p('a', 'one'), p('a', 'one moved'), p('a', 'copy text')], (n, v) => ({...n, body: {blocks: [v as Block, p('b', 'two')]}}), blockAt('a')],
  ['body:n', [undefined, p('n', 'new'), p('n', 'other')], (n, v) => ({...n, body: {blocks: [p('a', 'one'), ...(v ? [v as Block] : []), p('b', 'two')]}}), blockAt('n')],
]
const heldBy = (part: string, n: Note): Conflict => ({_key: 'k1', by: 'C', at: at(1), title: n.title, body: n.body, tags: n.tags, notebook: n.notebook ?? null, clash: [part]})
const picks = function* () {
  for (const [part, values, set, get] of forms) for (const s of values) for (const c of values) for (const t of values) yield {part, set, get, s, c, t, form: `${part} shown=${JSON.stringify(s)} copy=${JSON.stringify(c)} main=${JSON.stringify(t)}`}
}

test('Keep this ends with the copy showing in every part whatever the main moved to since it was shown, and keeps unseen moved words as a copy', () => {
  for (const {part, set, get, s, c, t, form} of picks()) {
    const shown = set(main, s)
    const k1 = heldBy(part, set(main, c))
    const out = keep({...set(main, t), _rev: 'r6', conflicts: [k1]}, 'k1', shown, at(9), 'local-k', 'dev-me')
    assert.ok(same(get(out), c), form)
    assert.ok(!out.conflicts?.some((x) => x._key === 'k1'), form)
    const kept = (out.conflicts ?? []).filter((x) => x._key.startsWith('local-k~')).map(get)
    assert.equal(kept.length, !same(t, s) && !same(t, c) ? 1 : 0, form)
    kept.forEach((v) => assert.ok(same(v, t), form))
  }
})

test('Keep this on an earlier copy brings that copy back over a main that moved since it was shown', () => {
  const k1 = copy('k1', 1, 'C', ['body:a'], 'Main', [p('a', 'one')])
  const k2 = copy('k2', 2, 'C', ['body:a'], 'Main', [p('a', 'C later')])
  const moved = {...main, _rev: 'r6', body: {blocks: [p('a', 'one moved'), p('b', 'two')]}, conflicts: [k1, k2]}
  assert.deepEqual(groups(moved.conflicts).map((g) => [g.latest._key, g.earlier.map((x) => x._key)]), [['k2', ['k1']]])
  const out = keep(moved, 'k1', main, at(9), 'local-k', 'dev-me')
  assert.deepEqual(texts(out), ['a:one', 'b:two'])
  assert.deepEqual(out.conflicts?.map((x) => blockText(x.body!.blocks.find((b) => b.id === 'a')!)).sort(), ['C later', 'one moved'])
})

test('a kept copy still shows after the push meets a main that moved again', () => {
  const k1 = copy('k1', 1, 'C', ['body:a'], 'Main', [p('a', 'one')])
  const moved = {...main, _rev: 'r6', body: {blocks: [p('a', 'one moved'), p('b', 'two')]}, conflicts: [k1]}
  const mine = keep(moved, 'k1', main, at(9), 'local-k', 'dev-me')
  const theirs = {...moved, _rev: 'r7', by: 'B', body: {blocks: [p('a', 'one moved again'), p('b', 'two')]}}
  const out = reconcile(moved, mine, theirs, at(10), 'dev-me')!
  assert.deepEqual(texts(out), ['a:one', 'b:two'])
  assert.ok(out.conflicts?.some((x) => blockText(x.body!.blocks[0]) === 'one moved again'))
})

test('Dismiss ends with that copy gone whatever moved since it was shown, and after the push meets a main that moved again', () => {
  const k1 = copy('k1', 1, 'A', ['body:a'], 'Main', [p('a', 'A one')])
  const k2 = copy('k2', 2, 'B', ['body:a'], 'Main', [p('a', 'B one')])
  const k3 = copy('k3', 3, 'D', ['title'], 'D title', [])
  const moved = {...main, _rev: 'r6', title: 'Moved', body: {blocks: [p('a', 'one moved'), p('b', 'two')]}, conflicts: [k1, k2, k3]}
  const mine = dismiss(moved, 'k1')
  assert.deepEqual([mine.title, texts(mine), mine.conflicts?.map((c) => c._key)], ['Moved', ['a:one moved', 'b:two'], ['k2', 'k3']])
  assert.deepEqual(dismiss(mine, 'k1').conflicts?.map((c) => c._key), ['k2', 'k3'])
  const k4 = copy('k4', 4, 'E', ['body:b'], 'Moved', [p('b', 'E two')])
  const theirs = {...moved, _rev: 'r7', by: 'B', title: 'Moved again', conflicts: [k1, k2, k3, k4]}
  const out = reconcile(moved, mine, theirs, at(10), 'dev-me')!
  assert.equal(out.title, 'Moved again')
  assert.deepEqual(out.conflicts?.map((c) => c._key), ['k2', 'k3', 'k4'])
})

test('Keep this on a copy holding two parts, one equal to the shown words and one not, shows both over a main that moved both', () => {
  const k1 = copy('k1', 1, 'C', ['title', 'body:a'], 'Main', [p('a', 'copy text')])
  const moved = {...main, _rev: 'r6', title: 'Moved', body: {blocks: [p('a', 'one moved'), p('b', 'two')]}, conflicts: [k1]}
  const out = keep(moved, 'k1', main, at(9), 'local-k', 'dev-me')
  assert.deepEqual([out.title, texts(out)], ['Main', ['a:copy text', 'b:two']])
  assert.deepEqual(out.conflicts?.map((c) => [c.title, blockText(c.body!.blocks[0]), c.clash.sort()]), [['Moved', 'one moved', ['body:a', 'title']]])
})
