// Barkpark documents → the rows the note list shows. Pure: no I/O, so `node --test` runs it.

export type BpNote = {_id: string; title?: string; notebook?: {_ref?: string} | null; _updatedAt?: string}
export type BpNotebook = {_id: string; name?: string}
export type NoteRow = {id: string; title: string; notebook: string}

export const UNTITLED = 'Untitled'
export const NO_NOTEBOOK = 'No notebook'

/**
 * One row per note, in the order given. A draft id (`drafts.x`) and its notebook ref both
 * resolve to the published id, so a draft-only notebook still names its notes.
 */
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
