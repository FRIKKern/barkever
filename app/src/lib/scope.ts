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

export const sameTag = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function tagTally(notes: Note[]): [string, number][] {
  const tally = new Map<string, {notes: number; spellings: Map<string, number>}>()
  for (const n of notes) {
    const seen = new Set<string>()
    for (const t of n.tags) {
      const key = t.toLowerCase()
      const tag = tally.get(key) ?? {notes: 0, spellings: new Map()}
      tag.spellings.set(t, (tag.spellings.get(t) ?? 0) + 1)
      if (!seen.has(key)) tag.notes++
      seen.add(key)
      tally.set(key, tag)
    }
  }
  const byCount = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0])
  return [...tally.values()].map((t): [string, number] => [[...t.spellings].sort(byCount)[0][0], t.notes]).sort(byCount)
}

export function withOpenAt(notes: Note[], count: number, open: string | undefined, at: number): Note[] {
  const note = open && notes.find((n) => n.id === open)
  if (!note || at < 0) return notes.slice(0, count)
  const rest = notes.slice(0, count).filter((n) => n !== note)
  return [...rest.slice(0, at), note, ...rest.slice(at)]
}

export function visibleNotes(notes: Note[], s: Search, shelf: Shelf): Found {
  if (terms(s.q).length) return find(notes, s.q!)
  const inScope = s.nb ? (n: Note) => !!n.notebook && shelf.scope(s.nb!).includes(n.notebook) : s.tag ? (n: Note) => n.tags.some((t) => sameTag(t, s.tag!)) : () => true
  return {notes: notes.filter(inScope).sort(newest), marks: []}
}

type Landing = {notebook: string; tags: string[]; search: Search}

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
