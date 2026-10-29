import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blockText, type Block} from '../lib/model.ts'
import {applyOps} from './ops.ts'

const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const show = (bs: Block[]) => bs.map((b) => `${b.id}:${blockText(b)}`)

test('a patch lands on a body another tab changed elsewhere, keeping both', () => {
  const theirs = [p('a', 'one'), p('b', 'TWO from the other tab')]
  const after = [p('a', 'one, edited here'), p('b', 'two')]
  const out = applyOps(theirs, [{op: 'patch-block', id: 'a', patch: {content: after[0].content}}], after)
  assert.deepEqual(show(out), ['a:one, edited here', 'b:TWO from the other tab'])
})

test('inserts chain off blocks made in the same batch', () => {
  const after = [p('a', 'one'), p('n1', 'new'), p('n2', 'newer')]
  const out = applyOps([p('a', 'one'), p('z', 'other tab')], [{op: 'insert-after', afterId: 'a', block: after[1]}, {op: 'insert-after', afterId: 'n1', block: after[2]}], after)
  assert.deepEqual(show(out), ['a:one', 'n1:new', 'n2:newer', 'z:other tab'])
})

test('removing a block that is already gone changes nothing', () => {
  assert.deepEqual(show(applyOps([p('a', 'one')], [{op: 'remove-block', id: 'b'}], [p('a', 'one')])), ['a:one'])
})

test('an edit to a block the other tab removed brings it back where it was', () => {
  const after = [p('a', 'one'), p('b', 'kept by this edit'), p('c', 'three')]
  const out = applyOps([p('a', 'one'), p('c', 'three')], [{op: 'patch-block', id: 'b', patch: {content: after[1].content}}], after)
  assert.deepEqual(show(out), ['a:one', 'b:kept by this edit', 'c:three'])
})

test('move to the top, append, and an op this code does not know take the after-state', () => {
  const table = {id: 't', type: 'table', caption: 'new cells'} as Block
  const after = [p('c', 'three'), p('a', 'one'), table, p('d', 'four')]
  const ops = [{op: 'move-block', id: 'c', after: null}, {op: 'patch-table-cells', id: 't'}, {op: 'append-block', block: after[3]}]
  const out = applyOps([p('a', 'one'), {id: 't', type: 'table', caption: 'old'} as Block, p('c', 'three')], ops, after)
  assert.deepEqual(out.map((b) => b.id), ['c', 'a', 't', 'd'])
  assert.equal(out[2].caption, 'new cells')
})
