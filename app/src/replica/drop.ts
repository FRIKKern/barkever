import {db} from './db.ts'
import {deleteNote} from './local.ts'
import {droppable} from './made.ts'

export async function dropIfBlank(id: string) {
  const doc = await (await db()).get('notes', id)
  if (doc && (await droppable(doc))) await deleteNote(id)
}

export async function dropBlankDrafts(open?: string) {
  for (const doc of await (await db()).getAll('notes')) if (doc._id !== open && (await droppable(doc))) await deleteNote(doc._id)
}
