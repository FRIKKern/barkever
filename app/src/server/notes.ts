import '@tanstack/react-start/server-only'
import {bpJson, dataset} from './barkpark'
import {toNoteRows, type BpNote, type BpNotebook, type NoteRow} from './note-rows'

type Page<T> = {result: {documents: T[]; hasMore: boolean}}

// Barkpark serves at most 1000 rows a request; this reads every page.
async function readAll<T>(type: string, order: string): Promise<T[]> {
  const docs: T[] = []
  for (let more = true; more; ) {
    const page = await bpJson<Page<T>>(`/v1/data/query/${dataset()}/${type}?perspective=drafts&order=${order}&limit=1000&offset=${docs.length}`)
    docs.push(...page.result.documents)
    more = page.result.hasMore && page.result.documents.length > 0
  }
  return docs
}

/** Every note, title A–Z, with its notebook's name (reads use perspective=drafts, decision 0013). */
export async function listNoteRows(): Promise<NoteRow[]> {
  const [notes, notebooks] = await Promise.all([readAll<BpNote>('note', 'title:asc'), readAll<BpNotebook>('notebook', 'name:asc')])
  return toNoteRows(notes, notebooks)
}
