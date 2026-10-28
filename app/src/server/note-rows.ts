
export type BpNote = {_id: string; title?: string; notebook?: {_ref?: string} | null; _updatedAt?: string}
export type BpNotebook = {_id: string; name?: string}
export type NoteRow = {id: string; title: string; notebook: string}

export const UNTITLED = 'Untitled'
export const NO_NOTEBOOK = 'No notebook'

export function toNoteRows(notes: BpNote[], notebooks: BpNotebook[]): NoteRow[] {
  const bare = (id: string) => id.replace(/^drafts\./, '')
  const names = new Map(notebooks.map((nb) => [bare(nb._id), nb.name?.trim() || NO_NOTEBOOK]))
  return notes.map((n) => {
    const ref = n.notebook?._ref
    return {
      id: bare(n._id),
      title: n.title?.trim() || UNTITLED,
      notebook: (ref && names.get(bare(ref))) || NO_NOTEBOOK,
    }
  })
}
