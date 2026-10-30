import {snippet, titleIn, UNTITLED, type Note} from './model.ts'
import {newest, terms} from './search.ts'

export type Candidate = {title: string; id: string; type: string}
export type Preview = {title: string; excerpt: string; subtitle: string; missing?: true}
export type Resolved = {title: string} | {missing: true}
export type Linker = {pick: (query: string) => Candidate[]; preview: (id: string) => Preview; resolve: (id: string) => Resolved}
type Named = (id: string | null) => string

export const PICKS = 8

export function linkCandidates(notes: Note[], from: string, query: string, notebook: Named): Candidate[] {
  const ts = terms(query)
  const q = ts.join(' ')
  const exact = query.toLowerCase()
  const title = (n: Note) => n.title.toLowerCase()
  const rank = (n: Note) => (title(n) === exact ? 0 : title(n).startsWith(q) ? 1 : 2)
  return notes
    .filter((n) => n.id !== from && n.title.trim() && ts.every((t) => title(n).includes(t)))
    .sort((a, b) => rank(a) - rank(b) || newest(a, b))
    .slice(0, PICKS)
    .map((n) => ({title: n.title, id: n.id, type: notebook(n.notebook)}))
}

export const DELETED: Preview = {title: 'Deleted note', excerpt: 'This note was deleted, so the link goes nowhere.', subtitle: '', missing: true}

export function linkPreview(byId: Map<string, Note>, id: string, notebook: Named): Preview {
  const n = byId.get(id)
  return n ? {title: n.title || UNTITLED, excerpt: snippet(n, titleIn(byId)), subtitle: notebook(n.notebook)} : DELETED
}

export function linkTitle(byId: Map<string, Note>, id: string): Resolved {
  const title = titleIn(byId)(id)
  return title ? {title} : {missing: true}
}
