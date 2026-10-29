import type {Block} from '../src/lib/model.ts'

const ONSETS = ['b', 'br', 'd', 'f', 'g', 'gl', 'k', 'l', 'm', 'n', 'p', 'pl', 'r', 's', 'st', 't', 'tr', 'v', 'z']
const VOWELS = ['a', 'e', 'i', 'o', 'u', 'ai', 'ou']
const CODAS = ['', 'n', 'r', 'l', 'm', 'st', 'nd', 'k']
const NOTEBOOKS = ['fx-nb-inbox', 'fx-nb-work', 'fx-nb-projects', 'fx-nb-meetings', 'fx-nb-home', 'fx-nb-reading', 'fx-nb-travel']
const TAGS = ['bulk-alpha', 'bulk-beta', 'bulk-gamma', 'bulk-delta', 'bulk-omega']
const VOCAB = 3000

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 2 ** 32
}

const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)]

function vocabulary(): string[] {
  const r = rng(7)
  const words = new Set<string>()
  while (words.size < VOCAB) words.add(Array.from({length: 2 + Math.floor(r() * 2)}, () => pick(r, ONSETS) + pick(r, VOWELS) + pick(r, CODAS)).join(''))
  return [...words]
}

const sentence = (r: () => number, words: string[], n: number) => {
  const s = Array.from({length: n}, () => words[Math.floor(r() ** 2 * words.length)]).join(' ')
  return `${s[0].toUpperCase()}${s.slice(1)}.`
}

export type BulkNote = {_id: string; _type: 'note'; title: string; notebook: {_ref: string}; tags: string[]; links: []; body: {blocks: Block[]}; _updatedAt: string}

export function bulkNotes(count: number): BulkNote[] {
  const words = vocabulary()
  const r = rng(42)
  return Array.from({length: count}, (_, i) => {
    const id = `bulk-${String(i).padStart(5, '0')}`
    return {
      _id: id,
      _type: 'note',
      title: sentence(r, words, 2 + Math.floor(r() * 3)).slice(0, -1),
      notebook: {_ref: pick(r, NOTEBOOKS)},
      tags: r() < 0.3 ? [pick(r, TAGS)] : [],
      links: [],
      body: {blocks: Array.from({length: 2 + Math.floor(r() * 3)}, (_, b) => ({id: `${id}-p${b}`, type: 'paragraph', content: [{type: 'text', value: sentence(r, words, 12 + Math.floor(r() * 20))}]}))},
      _updatedAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    }
  })
}
