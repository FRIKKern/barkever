import type {Note} from './model.ts'
import {newest, terms} from './search.ts'

export type Candidate = {title: string; id: string; type: string}

export const PICKS = 8

export function linkCandidates(notes: Note[], from: string, query: string, notebook: (id: string | null) => string): Candidate[] {
  const ts = terms(query)
  const q = ts.join(' ')
  const title = (n: Note) => n.title.toLowerCase()
  const starts = (n: Note) => (title(n).startsWith(q) ? 0 : 1)
  return notes
    .filter((n) => n.id !== from && n.title.trim() && ts.every((t) => title(n).includes(t)))
    .sort((a, b) => starts(a) - starts(b) || newest(a, b))
    .slice(0, PICKS)
    .map((n) => ({title: n.title, id: n.id, type: notebook(n.notebook)}))
}
