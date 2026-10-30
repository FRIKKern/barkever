import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {rng} from '../chaos/plan.ts'
import {newDevice, use} from '../chaos/fake-db.ts'
import {isBlank, type Block, type Note} from './model.ts'
import type {NoteDoc} from '../replica/note.ts'

const {dropBlankDrafts} = await import('../replica/drop.ts')
const {markMade} = await import('../replica/made.ts')

const TYPES = ['paragraph', 'heading', 'list', 'blockquote', 'text', 'strong', 'em', 'underline', 'strikethrough', 'code', 'wikilink', 'link', 'image', 'tag', 'callout']
const WORDS = ['', ' ', '\n\t', 'rope', ' knot ']
const KEYS = ['value', 'text', 'children', 'content', 'items', 'docId', 'target', 'alias', 'href', 'caption', 'level', 'checked', 'ordered', 'task', 'src']
const NAMES = new Set(['id', 'type', '_key', '_type'])

function tree(seed: number): Block[] {
  const r = rng(seed)
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const value = (depth: number): unknown => {
    const x = r()
    if (x < 0.4) return pick(WORDS)
    if (x < 0.5) return r() < 0.5 ? Math.floor(r() * 4) : r() < 0.5
    if (depth <= 0 || x < 0.6) return []
    return Array.from({length: 1 + Math.floor(r() * 3)}, () => (r() < 0.8 ? node(depth - 1) : {content: value(depth - 1), checked: r() < 0.5}))
  }
  const node = (depth: number): Record<string, unknown> => {
    const o: Record<string, unknown> = {type: r() < 0.7 ? pick(TYPES.slice(0, 10)) : pick(TYPES)}
    for (const k of KEYS) if (r() < 0.25) o[k] = value(depth)
    return o
  }
  return Array.from({length: 1 + Math.floor(r() * 3)}, (_, i) => ({id: `b${i}`, ...node(3)}) as Block)
}

const hasText = (x: unknown): boolean =>
  typeof x === 'string' ? !!x.trim() : Array.isArray(x) ? x.some(hasText) : !!x && typeof x === 'object' && Object.entries(x).some(([k, v]) => !NAMES.has(k) && hasText(v))

const note = (blocks: Block[]): Note => ({id: 'n', title: '', notebook: null, tags: [], blocks, links: [], updatedAt: '', rev: '', conflicts: [], gen: 0})

test('3000 random block trees: a note that stores any text anywhere is never blank, and some trees are blank', () => {
  let blank = 0
  for (let seed = 1; seed <= 3000; seed++) {
    const blocks = tree(seed)
    if (hasText(blocks)) assert.equal(isBlank(note(blocks)), false, `seed ${seed}: ${JSON.stringify(blocks)}`)
    if (isBlank(note(blocks))) blank++
  }
  assert.ok(blank > 30, `only ${blank} blank trees: the generator no longer reaches blank notes`)
})

test('300 random block trees in notes made here: the app-start sweep never drops one that stores any text', async () => {
  for (let seed = 1; seed <= 300; seed++) {
    const d = newDevice('dev-me')
    use(d)
    const blocks = tree(seed)
    d.stores.notes.set('n1', {_id: 'n1', _type: 'note', _rev: 'r1', title: '', tags: [], links: [], body: {blocks}} satisfies NoteDoc)
    await markMade('n1')
    await dropBlankDrafts()
    if (hasText(blocks)) assert.ok(d.stores.notes.has('n1'), `seed ${seed}: ${JSON.stringify(blocks)}`)
  }
})
