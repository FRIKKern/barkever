import {test} from 'node:test'
import assert from 'node:assert/strict'
import {indexLinks} from './links.ts'
import {overlaps, type LabelBox} from './labels.ts'
import {layoutNotesMap, mapLabels, MAP, ZOOMS, type NotesMap} from './map-layout.ts'
import type {Library, Note} from './model.ts'

function library(count: number, notebooks: number, seed = 7): Library {
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  const nbs = Array.from({length: notebooks}, (_, i) => ({id: `nb-${i}`, name: `Notebook ${i}`, parent: null}))
  const notes = Array.from({length: count}, (_, i) => ({
    id: `note-${String(i).padStart(5, '0')}`,
    title: `Note ${i} ${'about things '.slice(0, Math.floor(rand() * 13))}`.trim(),
    notebook: rand() < 0.03 ? null : nbs[Math.floor(rand() ** 2 * notebooks)].id,
    tags: [],
    blocks: [],
    links: [] as string[],
    updatedAt: '',
    rev: '',
    conflicts: [],
    gen: 0,
  })) as Note[]
  for (const n of notes) for (let j = Math.floor(rand() * 3); j > 0; j--) n.links.push(notes[Math.floor(rand() * count)].id)
  return {notes, notebooks: nbs}
}

const build = (lib: Library) => layoutNotesMap(lib, indexLinks(lib))
const areaOf = (map: NotesMap, id: string) => map.areas.find((a) => a.notes.includes(id))!

test('notes group by notebook into areas that never overlap, and every note sits inside its own area', () => {
  const lib = library(400, 9)
  const map = build(lib)
  assert.equal(map.nodes.length, lib.notes.length)
  for (const n of lib.notes) assert.equal(areaOf(map, n.id).notebook, n.notebook)
  assert.equal(new Set(map.areas.map((a) => a.notebook)).size, map.areas.length)
  for (const a of map.areas) for (const b of map.areas) if (a !== b) assert.ok(!overlaps(a, b), `${a.notebook} overlaps ${b.notebook}`)
  for (const n of map.nodes) {
    const a = map.areas.find((x) => x.id === n.area)!
    assert.ok(n.x - n.r >= a.x && n.x + n.r <= a.x + a.w && n.y - n.r >= a.y && n.y + n.r <= a.y + a.h, n.id)
  }
})

test('an area wastes no slots: every row is full but the last', () => {
  const map = build(library(400, 9))
  for (const a of map.areas) {
    const rows = new Map<number, number>()
    for (const id of a.notes) rows.set(map.at.get(id)!.y, (rows.get(map.at.get(id)!.y) ?? 0) + 1)
    const counts = [...rows.entries()].sort((p, q) => p[0] - q[0]).map(([, c]) => c)
    assert.ok(counts.slice(0, -1).every((c) => c === counts[0]) && counts.at(-1)! <= counts[0], `${a.notebook}: ${counts}`)
  }
})

test('no two shown labels overlap at any zoom step, and at 1x every note shows its label', () => {
  const map = build(library(300, 7))
  const clash = (boxes: LabelBox[]) => boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => overlaps(a, b)).map((b) => `${a.id} × ${b.id}`))
  for (const k of ZOOMS) {
    const shown = mapLabels(map, k)
    assert.deepEqual(clash(shown), [], `at ${k}`)
    if (k >= 1) assert.equal(shown.filter((b) => !b.area).length, map.nodes.length, `at ${k}`)
  }
  assert.ok(mapLabels(map, ZOOMS[0]).length < mapLabels(map, 1).length)
})

test('the same library lays out the same way, whatever order its notes arrive in', () => {
  const lib = library(500, 8)
  const a = build(lib)
  const b = build({...lib, notes: [...lib.notes].reverse()})
  assert.deepEqual([...b.at].sort(), [...a.at].sort())
  assert.deepEqual(b.areas, a.areas)
})

test('5,000 notes lay out, with labels picked, in under 1 s', () => {
  const lib = library(5000, 24)
  const links = indexLinks(lib)
  const t0 = performance.now()
  const map = layoutNotesMap(lib, links)
  const labels = mapLabels(map, ZOOMS[3])
  const ms = performance.now() - t0
  assert.equal(map.nodes.length, 5000)
  assert.ok(labels.length > 0)
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`)
  assert.ok(map.W * map.H < 5000 * MAP.dx * MAP.dy * 3, 'packed without big holes')
})
