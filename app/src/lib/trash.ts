import {UNTITLED, wikilinks, type Library, type Note} from './model.ts'

export type Shelved = Library & {trash: Note[]}

type Split = Pick<Shelved, 'notes' | 'trash'>

export function split(all: Note[]): Split {
  const out: Split = {notes: [], trash: []}
  for (const n of all) (n.trashed ? out.trash : out.notes).push(n)
  return out
}

export function withFresh(lib: Split, fresh: Note[], ids: string[]): Split {
  const others = (xs: Note[]) => xs.filter((n) => !ids.includes(n.id))
  const {notes, trash} = split(fresh)
  return {notes: [...notes, ...others(lib.notes)], trash: [...trash, ...others(lib.trash)]}
}

export const newestTrashed = (trash: Note[]) => [...trash].sort((a, b) => (b.trashed ?? '').localeCompare(a.trashed ?? '') || a.id.localeCompare(b.id))

export const linkedFrom = (notes: Note[], ids: string[]) => notes.filter((n) => !ids.includes(n.id) && [...n.links, ...wikilinks(n.blocks)].some((to) => ids.includes(to))).length

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const linkedLine = (linked: number, where: string) => (linked ? ` ${plural(linked, 'note links', 'notes link')} ${where}; their links will show as gone.` : '')

export function foreverAsk(note: Note, linked: number): string {
  return `Delete “${note.title || UNTITLED}” forever?${linkedLine(linked, 'here')} This can’t be undone.`
}

export const emptyAsk = (count: number, linked: number) => `Delete ${plural(count, 'note', 'notes')} in Trash forever?${linkedLine(linked, 'into Trash')} This can’t be undone.`
