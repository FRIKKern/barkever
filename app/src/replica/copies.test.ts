import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mergeLocal, mergeNote} from './merge.ts'
import {sign, UNSIGNED, writerOf} from './sign.ts'
import {blockText, type Block} from '../lib/model.ts'
import {groups} from '../lib/versions.ts'
import type {NoteDoc as Note} from './note.ts'

const AT = '2026-10-29T12:00:00.000Z'
const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const r0: Note = {_id: 'n1', _type: 'note', _rev: 'r0', title: 'Plan', tags: [], links: [], body: {blocks: [p('a', 'one'), p('b', 'two')]}}
const textA = (n: {body?: {blocks: Block[]}}) => blockText(n.body!.blocks.find((b) => b.id === 'a')!)
const copies = (n: Note) => (n.conflicts ?? []).map((c) => [c.by, c.title, textA(c)])
const blocksWith = (n: Note, text: string) => ({body: {blocks: n.body!.blocks.map((b) => (b.id === 'a' ? p('a', text) : b))}})
const shown = (n: Note) => groups(n.conflicts ?? []).map(({latest: c}) => [c.by, c.title, textA(c)])
const kept = (n: Note) => JSON.stringify([n.title, n.body, n.conflicts])
let clock = 0
const tick = () => new Date(Date.parse(AT) + ++clock * 1000).toISOString()

function world() {
  let server = r0
  let revs = 0
  const device = (id: string) => {
    let base = r0
    let local = r0
    let saves = 0
    return {
      id,
      get local() {
        return local
      },
      typeBlock: (text: string) => (local = mergeLocal(local, {body: local.body}, blocksWith(local, text), tick(), `local-${id}-${++saves}`, id, base)),
      typeTitle: (title: string, shown = local.title) => (local = mergeLocal(local, {title: shown}, {title}, tick(), `local-${id}-${++saves}`, id, base)),
      pull: () => ((local = mergeNote(base, local, server, tick(), id)), (base = server)),
      push: () => (server = base = local = {...sign(local, id), _rev: `r${++revs}`}),
    }
  }
  return {
    device,
    get server() {
      return server
    },
    raw: (patch: Partial<Note>) => (server = {...server, ...patch, _rev: `r${++revs}`}),
  }
}

test('signing names the writer, survives a Barkpark round trip, and any later change unsigns it', () => {
  const signed = sign(r0, 'dev-a')
  assert.equal(writerOf(signed), 'dev-a')
  const roundTrip = {...Object.fromEntries(Object.entries(signed).reverse()), body: {blocks: signed.body!.blocks.map((b) => ({content: b.content, type: b.type, id: b.id, caption: ''}))}} as Note
  assert.equal(writerOf(roundTrip), 'dev-a')
  assert.equal(writerOf({...signed, title: 'Changed by a raw write'}), undefined)
  assert.equal(writerOf(r0), undefined)
})

test('a copy goes only once this device typed from every one of its clashing texts, and it keeps a list of what it typed from', () => {
  const B = sign({...r0, _rev: 'r1', title: 'B title', ...blocksWith(r0, 'B one')}, 'B')
  const mine = mergeNote(r0, {...r0, title: 'A title', ...blocksWith(r0, 'A one')}, B, AT, 'A')
  assert.deepEqual(copies(mine), [['B', 'B title', 'B one']])
  const title = mergeLocal(mine, {title: 'B title'}, {title: 'B title, mine'}, AT, 'local-1', 'A', B)
  assert.deepEqual(copies(title), [['B', 'B title', 'B one'], ['A~tab', 'A title', 'A one']])
  const block = mergeLocal(title, blocksWith(title, 'B one'), blocksWith(title, 'B one, mine'), AT, 'local-2', 'A', B)
  assert.deepEqual(copies(block).map(([by]) => by), ['A~tab', 'A~tab'])
  assert.equal(block._typed?.length, 2)
})

test('two writers typing in one block online: each typed from its own last text, so one copy stays, the other writer’s latest', () => {
  const w = world()
  const [A, B] = [w.device('A'), w.device('B')]
  const pushed: Record<string, string> = {}
  for (let k = 0; k < 12; k++) {
    const [me, other] = k % 2 ? [B, A] : [A, B]
    me.typeBlock(`${me.id} typed ${k}`)
    me.pull()
    me.push()
    pushed[me.id] = `${me.id} typed ${k}`
    assert.equal(textA(w.server), pushed[me.id])
    if (pushed[other.id]) assert.deepEqual(copies(w.server), [[other.id, 'Plan', pushed[other.id]]], `round ${k}`)
  }
})

test('review 3b: one raw writer setting the title six times while I type it keeps all six, shows its latest and folds the five earlier', () => {
  const w = world()
  const D = w.device('D')
  for (let i = 1; i <= 6; i++) {
    D.typeTitle(`D title ${i}`)
    w.raw({title: `Server title ${i}`})
    D.pull()
    D.push()
    assert.equal(w.server.title, `D title ${i}`)
    assert.deepEqual(shown(w.server), [[UNSIGNED, `Server title ${i}`, 'one']], `round ${i}`)
  }
  assert.deepEqual(copies(w.server).map(([, t]) => t), [1, 2, 3, 4, 5, 6].map((i) => `Server title ${i}`))
  const [only, ...more] = groups(w.server.conflicts!)
  assert.equal(more.length, 0)
  assert.deepEqual([only.latest.title, only.earlier.map((c) => c.title)], ['Server title 6', [5, 4, 3, 2, 1].map((i) => `Server title ${i}`)])
})

test('a title typed over a remote title the box never showed names the remote writer, and its next title folds the first', () => {
  const w = world()
  const D = w.device('D')
  D.push()
  w.raw({title: 'Remote 1'})
  D.pull()
  D.typeTitle('Plan!', 'Plan')
  assert.deepEqual(copies(D.local), [[UNSIGNED, 'Remote 1', 'one']])
  w.raw({title: 'Remote 2'})
  D.pull()
  assert.deepEqual(copies(D.local), [[UNSIGNED, 'Remote 1', 'one'], [UNSIGNED, 'Remote 2', 'one']])
  assert.deepEqual(shown(D.local), [[UNSIGNED, 'Remote 2', 'one']])
})

test('three writers on one block: the last keeps the main, one copy of each other writer', () => {
  const w = world()
  const [A, B] = [w.device('A'), w.device('B')]
  A.typeBlock('A offline')
  B.typeBlock('B offline')
  w.raw(blocksWith(w.server, 'Server edit'))
  B.pull()
  B.push()
  A.pull()
  A.push()
  B.pull()
  assert.equal(textA(B.local), 'A offline')
  assert.deepEqual(copies(B.local), [[UNSIGNED, 'Plan', 'Server edit'], ['B', 'Plan', 'B offline']])
})

test('a writer’s copy for the title survives that writer’s later clash in a block', () => {
  const w = world()
  const [A, B] = [w.device('A'), w.device('B')]
  A.typeTitle('A title')
  B.typeTitle('B title')
  B.push()
  A.pull()
  A.push()
  B.pull()
  B.typeBlock('B block')
  A.typeBlock('A block')
  B.push()
  A.pull()
  assert.deepEqual(copies(A.local), [['B', 'B title', 'one'], ['B', 'A title', 'B block']])
})

test('two tabs typing in one block: each tab typed from its own last text, so one copy stays, the other tab’s latest', () => {
  let replica: Note = sign(r0, 'D')
  let [one, two] = [r0.body!.blocks, r0.body!.blocks]
  const save = (shown: Block[], text: string, k: number) => {
    const after = blocksWith({...replica, body: {blocks: shown}}, text).body.blocks
    replica = mergeLocal(replica, {body: {blocks: shown}}, {body: {blocks: after}}, tick(), `local-${k}`, 'D', sign(r0, 'D'))
    return after
  }
  for (let k = 0; k < 6; k++) {
    one = save(one, `tab one ${k}`, 2 * k)
    two = save(two, `tab two ${k}`, 2 * k + 1)
  }
  assert.equal(textA(replica), 'tab two 5')
  assert.deepEqual(copies(replica), [['D~tab', 'Plan', 'tab one 5']])
})

test('catching up past a third writer’s title change keeps the first writer’s title copy', () => {
  const w = world()
  const [D, X] = [w.device('D'), w.device('X')]
  X.typeTitle('X title')
  D.typeTitle('D title')
  X.push()
  D.pull()
  D.push()
  X.pull()
  w.raw({title: 'Raw title'})
  X.pull()
  X.typeBlock('X block')
  X.push()
  D.typeBlock('D block')
  D.pull()
  assert.deepEqual(copies(D.local).find(([by]) => by === 'X'), ['X', 'X title', 'one'])
})

test('a title typed over one changed in another tab keeps both', () => {
  const replica: Note = {...r0, title: 'From the other tab'}
  const out = mergeLocal(replica, {title: 'Plan'}, {title: 'Plan, typed here'}, AT, 'local-1', 'D', r0)
  assert.equal(out.title, 'Plan, typed here')
  assert.deepEqual(copies(out), [['D~tab', 'From the other tab', 'one']])
})

const keptTitles = (n: Note) => (n.conflicts ?? []).map((c) => [c.by, c.title])
const keptBlocks = (n: Note) => (n.conflicts ?? []).map((c) => [c.by, textA(c)])

test('both typed the title: the loser types on the main, and its losing title stays on the server and both devices', () => {
  const w = world()
  const [A, B] = [w.device('A'), w.device('B')]
  A.typeTitle('A title')
  A.push()
  B.typeTitle('B title')
  B.pull()
  B.push()
  A.pull()
  assert.equal(A.local.title, 'B title')
  assert.deepEqual(keptTitles(A.local), [['A', 'A title']])
  A.typeTitle('B title!')
  A.push()
  B.pull()
  B.typeTitle('B title!?')
  B.push()
  A.pull()
  A.typeTitle('B title!?.')
  A.push()
  B.pull()
  for (const n of [A.local, B.local, w.server]) {
    assert.equal(n.title, 'B title!?.')
    assert.deepEqual(keptTitles(n), [['A', 'A title']])
  }
})

test('both typed one block: the loser types on the main, and its losing block stays on the server and both devices', () => {
  const w = world()
  const [A, B] = [w.device('A'), w.device('B')]
  A.typeBlock('A block')
  A.push()
  B.typeBlock('B block')
  B.pull()
  B.push()
  A.pull()
  assert.equal(textA(A.local), 'B block')
  A.typeBlock('B block!')
  A.push()
  B.pull()
  B.typeBlock('B block!?')
  B.push()
  A.pull()
  for (const n of [A.local, B.local, w.server]) {
    assert.equal(textA(n), 'B block!?')
    assert.deepEqual(keptBlocks(n), [['A', 'A block']])
  }
})

test('a title set offline wins the main on reconnect: the online writer types on it, and its losing title stays', () => {
  const w = world()
  const [A, B] = [w.device('A'), w.device('B')]
  A.typeTitle('Plan A offline')
  B.typeTitle('Plan B')
  B.push()
  A.pull()
  A.push()
  B.pull()
  assert.equal(B.local.title, 'Plan A offline')
  B.typeTitle('Plan A offline!')
  B.push()
  A.pull()
  for (const n of [A.local, B.local, w.server]) {
    assert.equal(n.title, 'Plan A offline!')
    assert.deepEqual(keptTitles(n), [['B', 'Plan B']])
  }
})

test('my own earlier push clashing with my newer text never drops a copy of mine', () => {
  const lost = {_key: 'r1', by: 'D', at: AT, title: 'D lost this', body: r0.body, clash: ['title']}
  const base: Note = {...r0, _rev: 'r1', title: 'Main', conflicts: [lost]}
  const theirs: Note = {...sign({...base, title: 'Main from my earlier push'}, 'D'), _rev: 'r2'}
  const out = mergeNote(base, {...base, title: 'Main typed here'}, theirs, AT, 'D')
  assert.equal(out.title, 'Main typed here')
  assert.deepEqual(keptTitles(out), [['D', 'D lost this']])
})

const one = (t: string) => ({body: {blocks: [p('a', t)]}})
const signed = (n: Note, by: string, rev: string): Note => ({...sign(n, by), _rev: rev})

test('a second offline clash on the same block keeps the first losing text, folded under the writer’s latest', () => {
  const s0: Note = {...r0, ...one('Base')}
  const s1 = signed({...s0, ...one('Base A1')}, 'A', 'r1')
  const s2 = signed(mergeNote(s0, {...s0, ...one('Base B1')}, s1, tick(), 'B'), 'B', 'r2')
  const s3 = signed({...s2, ...one('Base B1 a')}, 'A', 'r3')
  const s4 = mergeNote(s2, {...s2, ...one('Base B1 b')}, s3, tick(), 'B')
  assert.equal(textA(s4), 'Base B1 b')
  assert.deepEqual(copies(s4).map(([by, , t]) => [by, t]), [['A', 'Base A1'], ['A', 'Base B1 a']])
  assert.deepEqual(groups(s4.conflicts!).map((g) => [textA(g.latest), g.earlier.map(textA)]), [['Base B1 a', ['Base A1']]])
})

test('an offline clash, then both typing online, keeps the offline loser’s text', () => {
  const s0: Note = {...r0, ...one('Base')}
  const s1 = signed({...s0, ...one('Base A1')}, 'A', 'r1')
  const s2 = signed(mergeNote(s0, {...s0, ...one('Base B1')}, s1, tick(), 'B'), 'B', 'r2')
  const s3 = signed({...s2, ...one('Base B1 b')}, 'B', 'r3')
  const s4 = signed(mergeNote(s2, {...s2, ...one('Base B1 a')}, s3, tick(), 'A'), 'A', 'r4')
  const s5 = mergeNote(s3, {...s3, ...one('Base B1 bb')}, s4, tick(), 'B')
  for (const t of ['Base A1', 'Base B1 a', 'Base B1 b', 'Base B1 bb']) assert.ok(kept(s5).includes(t), t)
})

test('titles: two offline hours keep the first losing title, and two raw writers keep both', () => {
  const t0: Note = {...r0, body: {blocks: []}}
  const t1 = signed({...t0, title: 'Plan A'}, 'A', 'r1')
  const t2 = signed(mergeNote(t0, {...t0, title: 'Plan B'}, t1, tick(), 'B'), 'B', 'r2')
  const t3 = signed({...t2, title: 'Plan B, a'}, 'A', 'r3')
  const t4 = mergeNote(t2, {...t2, title: 'Plan B, b'}, t3, tick(), 'B')
  assert.deepEqual(keptTitles(t4), [['A', 'Plan A'], ['A', 'Plan B, a']])
  const studio = {...t0, title: 'Studio edit', _rev: 'r1'}
  const m1 = signed(mergeNote(t0, {...t0, title: 'Plan mine'}, studio, tick(), 'A'), 'A', 'r2')
  const m2 = mergeNote(m1, {...m1, title: 'Plan mine 2'}, {...m1, title: 'CLI edit', _rev: 'r3'}, tick(), 'A')
  assert.deepEqual(keptTitles(m2), [[UNSIGNED, 'Studio edit'], [UNSIGNED, 'CLI edit']])
  assert.deepEqual(groups(m2.conflicts!).map((g) => g.latest.title), ['CLI edit'])
})

test('a title set back to one I typed over is mine again: when another writer overwrites it, its copy stays with me', () => {
  const w = world()
  const [a, b] = [w.device('A'), w.device('B')]
  b.typeTitle('B1')
  b.push()
  b.typeTitle('B2')
  b.typeTitle('B1')
  b.push()
  a.typeTitle('A1')
  a.pull()
  a.push()
  b.pull()
  assert.deepEqual([b.local.title, (b.local.conflicts ?? []).map((c) => c.title)], ['A1', ['B1']])
})
