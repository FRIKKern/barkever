import type {Note} from './model.ts'
import {find, newest, terms, type Found} from './search.ts'
import type {Shelf} from './notebooks.ts'

export type Search = {nb?: string; tag?: string; q?: string; n?: string; view?: 'tasks'; line?: string}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

export const parseSearch = (s: Record<string, unknown>): Search => ({nb: str(s.nb), tag: str(s.tag), q: str(s.q), n: str(s.n), view: s.view === 'tasks' ? 'tasks' : undefined, line: str(s.line)})

export function leaveNote({search, next}: {search: Search; next: (s: Search) => Search}): Search {
  const to = next(search)
  if (to.n === search.n) return to
  return {...to, line: to.line === search.line ? undefined : to.line, view: to.view === search.view ? undefined : to.view}
}

export function visibleNotes(notes: Note[], s: Search, shelf: Shelf): Found {
  if (terms(s.q).length) return find(notes, s.q!)
  const inScope = s.nb ? (n: Note) => !!n.notebook && shelf.scope(s.nb!).includes(n.notebook) : s.tag ? (n: Note) => n.tags.includes(s.tag!) : () => true
  return {notes: notes.filter(inScope).sort(newest), marks: []}
}

export type Landing = {notebook: string; tags: string[]; search: Search}

export function landing(s: Search, shelf: Shelf): Landing | null {
  const here = s.nb && shelf.byId.has(s.nb) ? s.nb : undefined
  const notebook = here ?? [...shelf.byId.values()].find((nb) => nb.name.toLowerCase() === 'inbox')?.id ?? shelf.roots[0]?.id
  if (!notebook) return null
  return {notebook, tags: s.tag ? [s.tag] : [], search: {nb: s.nb && notebook, tag: s.tag}}
}

export function scopeName(s: Search, shelf: Shelf): string {
  if (s.view === 'tasks') return 'Tasks'
  if (terms(s.q).length) return 'Search'
  if (s.nb) return shelf.byId.get(s.nb)?.name ?? 'Notebook'
  if (s.tag) return `#${s.tag}`
  return 'All notes'
}
