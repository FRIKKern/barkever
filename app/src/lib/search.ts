import {blockText, type Note} from './model.ts'

type Entry = {title: string; text: string; words: string[]}
type Hit = {note: Note; score: number}
export type Found = {notes: Note[]; marks: string[]}

const WORD = /[\p{L}\p{N}]+/gu
const ONE_TYPO_FROM = 5
const TWO_TYPOS_FROM = 9
const TITLE = 4
const BODY = 3
const TYPO_TITLE = 2
const TYPO = 1

const entries = new WeakMap<Note, Entry>()

function entry(n: Note): Entry {
  let e = entries.get(n)
  if (!e) {
    const title = n.title.toLowerCase()
    const text = `${title} ${n.blocks.map(blockText).join(' ')} ${n.tags.join(' ')}`.toLowerCase()
    e = {title, text, words: [...new Set(text.match(WORD))]}
    entries.set(n, e)
  }
  return e
}

const SLICE_MS = 8
const postings = new Map<string, Set<Note>>()
const indexed = new Set<Note>()
let last: Note[] | undefined
let preparing: Note[] | undefined

function add(n: Note) {
  for (const w of entry(n).words) {
    const p = postings.get(w)
    if (p) p.add(n)
    else postings.set(w, new Set([n]))
  }
  indexed.add(n)
}

function drop(n: Note) {
  for (const w of entry(n).words) {
    const p = postings.get(w)!
    p.delete(n)
    if (!p.size) postings.delete(w)
  }
  indexed.delete(n)
}

function follow(notes: Note[]) {
  if (notes === last) return
  const now = new Set(notes)
  for (const n of indexed) if (!now.has(n)) drop(n)
  for (const n of notes) if (!indexed.has(n)) add(n)
  last = notes
}

const later = (f: (d?: IdleDeadline) => void) => void (globalThis.requestIdleCallback ?? setTimeout)(f)

export function prepare(notes: Note[]) {
  preparing = notes
  let i = 0
  const step = (d?: IdleDeadline) => {
    if (preparing !== notes) return
    const until = performance.now() + Math.min(d?.timeRemaining() ?? SLICE_MS, SLICE_MS)
    while (i < notes.length && performance.now() < until) {
      const n = notes[i++]
      if (!indexed.has(n)) add(n)
    }
    if (i < notes.length) later(step)
    else follow(notes)
  }
  later(step)
}

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export const newest = (a: Note, b: Note) => order(b.updatedAt, a.updatedAt) || order(a.id, b.id)

export const terms = (q = '') => q.toLowerCase().split(/\s+/).map((t) => t.replace(/^#/, '')).filter(Boolean)

const typos = (term: string) => (term.length >= TWO_TYPOS_FROM ? 2 : term.length >= ONE_TYPO_FROM ? 1 : 0)

export function within(a: string, b: string, k: number): boolean {
  if (Math.abs(a.length - b.length) > k) return false
  let prev2: number[] = []
  let prev = Array.from({length: b.length + 1}, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1)
      row.push(d)
      best = Math.min(best, d)
    }
    if (best > k) return false
    prev2 = prev
    prev = row
  }
  return prev[b.length] <= k
}

function matcher(term: string) {
  const k = typos(term)
  const near = k ? [...postings.keys()].filter((w) => w[0] === term[0] && !w.includes(term) && within(term, w, k)) : []
  const loose = new Set(near.flatMap((w) => [...postings.get(w)!]))
  const score = (n: Note): number => {
    const e = entry(n)
    if (e.title.includes(term)) return TITLE
    if (e.text.includes(term)) return BODY
    if (!loose.has(n)) return 0
    return near.some((w) => e.title.includes(w)) ? TYPO_TITLE : TYPO
  }
  return {score, marks: [term, ...near]}
}

export function find(notes: Note[], q: string): Found {
  const ts = terms(q)
  if (!ts.length) return {notes, marks: []}
  follow(notes)
  const matchers = ts.map(matcher)
  const hits: Hit[] = []
  for (const note of notes) {
    let score = 0
    for (const m of matchers) {
      const s = m.score(note)
      if (!s) {
        score = 0
        break
      }
      score += s
    }
    if (score) hits.push({note, score})
  }
  hits.sort((a, b) => b.score - a.score || newest(a.note, b.note))
  return {notes: hits.map((h) => h.note), marks: matchers.flatMap((m) => m.marks)}
}
