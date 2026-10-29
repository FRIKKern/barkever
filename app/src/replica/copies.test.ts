import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mergeLocal, mergeNote} from './merge.ts'
import {sign, UNSIGNED, writerOf} from './sign.ts'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc as Note} from './note.ts'

const AT = '2026-10-29T12:00:00.000Z'
const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const r0: Note = {_id: 'n1', _type: 'note', _rev: 'r0', title: 'Plan', tags: [], links: [], body: {blocks: [p('a', 'one'), p('b', 'two')]}}
const textA = (n: {body?: {blocks: Block[]}}) => blockText(n.body!.blocks.find((b) => b.id === 'a')!)
const copies = (n: Note) => (n.conflicts ?? []).map((c) => [c.by, c.title, textA(c)])
const blocksWith = (n: Note, text: string) => ({body: {blocks: n.body!.blocks.map((b) => (b.id === 'a' ? p('a', text) : b))}})

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
      typeBlock: (text: string) => (local = mergeLocal(local, {body: local.body}, blocksWith(local, text), AT, `local-${id}-${++saves}`, id, base)),
      typeTitle: (title: string, shown = local.title) => (local = mergeLocal(local, {title: shown}, {title}, AT, `local-${id}-${++saves}`, id, base)),
      pull: () => ((local = mergeNote(base, local, server, AT, id)), (base = server)),
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

test('two writers typing in one block online: one copy, the other writer’s latest, never the writer’s own', () => {
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

test('one raw writer setting the title six times while I type it keeps one copy, its latest', () => {
  const w = world()
  const D = w.device('D')
  for (let i = 1; i <= 6; i++) {
    D.typeTitle(`D title ${i}`)
    w.raw({title: `Server title ${i}`})
    D.pull()
    D.push()
    assert.equal(w.server.title, `D title ${i}`)
    assert.deepEqual(copies(w.server), [[UNSIGNED, `Server title ${i}`, 'one']], `round ${i}`)
  }
})

test('a title typed over a remote title the box never showed names the remote writer, and its next title replaces that copy', () => {
  const w = world()
  const D = w.device('D')
  D.push()
  w.raw({title: 'Remote 1'})
  D.pull()
  D.typeTitle('Plan!', 'Plan')
  assert.deepEqual(copies(D.local), [[UNSIGNED, 'Remote 1', 'one']])
  w.raw({title: 'Remote 2'})
  D.pull()
  assert.deepEqual(copies(D.local), [[UNSIGNED, 'Remote 2', 'one']])
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

test('two tabs typing in one block keep one copy, the other tab’s latest', () => {
  let replica: Note = sign(r0, 'D')
  let [one, two] = [r0.body!.blocks, r0.body!.blocks]
  const save = (shown: Block[], text: string, k: number) => {
    const after = blocksWith({...replica, body: {blocks: shown}}, text).body.blocks
    replica = mergeLocal(replica, {body: {blocks: shown}}, {body: {blocks: after}}, AT, `local-${k}`, 'D', sign(r0, 'D'))
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
