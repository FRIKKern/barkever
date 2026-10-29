import {noteText, type Note} from './model.ts'
import type {Shelf} from './notebooks.ts'

export type Search = {nb?: string; tag?: string; q?: string; n?: string}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

export const parseSearch = (s: Record<string, unknown>): Search => ({nb: str(s.nb), tag: str(s.tag), q: str(s.q), n: str(s.n)})

export const terms = (q = '') => q.toLowerCase().split(/\s+/).filter(Boolean)

export function visibleNotes(notes: Note[], s: Search, shelf: Shelf): Note[] {
  const words = terms(s.q)
  const inScope = words.length
    ? (n: Note) => words.every((w) => noteText(n).includes(w))
    : s.nb
      ? (n: Note) => !!n.notebook && shelf.scope(s.nb!).includes(n.notebook)
      : s.tag
        ? (n: Note) => n.tags.includes(s.tag!)
        : () => true
  return notes.filter(inScope).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
}

export type Landing = {notebook: string; tags: string[]; search: Search}

export function landing(s: Search, shelf: Shelf): Landing | null {
  const here = s.nb && shelf.byId.has(s.nb) ? s.nb : undefined
  const notebook = here ?? [...shelf.byId.values()].find((nb) => nb.name.toLowerCase() === 'inbox')?.id ?? shelf.roots[0]?.id
  if (!notebook) return null
  return {notebook, tags: s.tag ? [s.tag] : [], search: {nb: s.nb && notebook, tag: s.tag}}
}

export function scopeName(s: Search, shelf: Shelf): string {
  if (terms(s.q).length) return 'Search'
  if (s.nb) return shelf.byId.get(s.nb)?.name ?? 'Notebook'
  if (s.tag) return `#${s.tag}`
  return 'All notes'
}
