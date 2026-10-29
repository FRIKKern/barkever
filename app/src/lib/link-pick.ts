import {snippet, UNTITLED, type Note} from './model.ts'
import {newest, terms} from './search.ts'

export type Candidate = {title: string; id: string; type: string}
export type Preview = {title: string; excerpt: string; subtitle: string}
export type Linker = {pick: (query: string) => Candidate[]; preview: (id: string) => Preview | null}
type Named = (id: string | null) => string

export const PICKS = 8

export function linkCandidates(notes: Note[], from: string, query: string, notebook: Named): Candidate[] {
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

export function linkPreview(byId: Map<string, Note>, id: string, notebook: Named): Preview | null {
  const n = byId.get(id)
  return n ? {title: n.title || UNTITLED, excerpt: snippet(n), subtitle: notebook(n.notebook)} : null
}
