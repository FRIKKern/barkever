import {db, type LocalNote} from './db.ts'
import {deleteNote, journalHoldsWords, owesWords} from './local.ts'
import {droppable} from './made.ts'

const blank = async (doc: LocalNote) => !owesWords(doc._id) && !journalHoldsWords(doc._id) && (await droppable(doc))

export async function dropIfBlank(id: string) {
  const doc = await (await db()).get('notes', id)
  if (doc && (await blank(doc))) await deleteNote(id)
}

export async function dropBlankDrafts(open?: string) {
  for (const doc of await (await db()).getAll('notes')) if (doc._id !== open && (await blank(doc))) await deleteNote(doc._id)
}
