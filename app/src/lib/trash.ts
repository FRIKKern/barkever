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

export const linkedFrom = (notes: Note[], id: string) => notes.filter((n) => n.id !== id && (n.links.includes(id) || wikilinks(n.blocks).includes(id))).length

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function foreverAsk(note: Note, linked: number): string {
  const links = linked ? ` ${plural(linked, 'note links', 'notes link')} here; their links will show as gone.` : ''
  return `Delete “${note.title || UNTITLED}” forever?${links} This can’t be undone.`
}

export const emptyAsk = (count: number) => `Delete ${plural(count, 'note', 'notes')} in Trash forever? This can’t be undone.`
