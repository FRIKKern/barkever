import {test} from 'node:test'
import assert from 'node:assert/strict'
import {indexLinks} from './links.ts'
import {overlaps} from './labels.ts'
import {clusterLabels, CLUSTER, layoutCluster} from './cluster-layout.ts'
import type {Library, Note} from './model.ts'

const note = (id: string, links: string[] = []) => ({id, title: `Note ${id}`, notebook: null, tags: [], blocks: [], links, updatedAt: '', rev: '', conflicts: [], gen: 0}) as Note
const lib = (notes: Note[]): Library => ({notes, notebooks: []})

test('the cluster shows the note, its links one and two hops out either way, and nothing further', () => {
  const links = indexLinks(lib([note('c', ['a']), note('a', ['b']), note('b', ['far']), note('far'), note('in', ['c']), note('in2', ['in']), note('alone')]))
  const g = layoutCluster('c', links)
  const hop = Object.fromEntries(g.nodes.map((n) => [n.id, n.hop]))
  assert.deepEqual(hop, {c: 0, a: 1, in: 1, b: 2, in2: 2})
  assert.deepEqual(g.edges.map((e) => `${e.a}>${e.b}`).sort(), ['a>b', 'c>a', 'in2>in', 'in>c'])
  const at = new Map(g.nodes.map((n) => [n.id, n]))
  assert.ok(at.get('in')!.x < CLUSTER.cx && at.get('a')!.x > CLUSTER.cx, 'linked-from sits left, links-to right')
})

test('a busy cluster caps each ring, says how many more, keeps labels apart and inside the frame', () => {
  const hubs = Array.from({length: 30}, (_, i) => note(`h${i}`, Array.from({length: 6}, (_, j) => `x${i}-${j}`)))
  const far = hubs.flatMap((_, i) => Array.from({length: 6}, (_, j) => note(`x${i}-${j}`)))
  const links = indexLinks(lib([note('c', hubs.map((h) => h.id)), ...hubs, ...far]))
  const g = layoutCluster('c', links)
  assert.ok(g.nodes.length < 60)
  assert.ok(g.more > 0)
  const shown = clusterLabels(g, links.title)
  assert.ok(shown.some((b) => b.id === 'c'))
  for (const [i, a] of shown.entries()) {
    assert.ok(a.x >= 0 && a.x + a.w <= CLUSTER.W, a.id)
    for (const b of shown.slice(i + 1)) assert.ok(!overlaps(a, b), `${a.id} × ${b.id}`)
  }
})
