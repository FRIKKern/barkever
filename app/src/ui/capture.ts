import {useQueryClient} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'
import {refresh} from '../lib/library'
import {isBlank} from '../lib/model'
import {toNote} from '../lib/note-docs'
import {landing, type Search} from '../lib/scope'
import {db, type LocalNote} from '../replica/db'
import {createNote, deleteNote} from '../replica/local'
import type {World} from './world'

const fresh = new Set<string>()

const blank = (doc: LocalNote) => isBlank(toNote(doc))

export async function dropIfBlank(id: string) {
  const made = fresh.delete(id)
  const doc = await (await db()).get('notes', id)
  if (doc && (made || !doc._rev) && blank(doc)) await deleteNote(id)
}

export async function dropBlankDrafts(open?: string) {
  for (const doc of await (await db()).getAll('notes')) if (doc._id !== open && !doc._rev && blank(doc)) await deleteNote(doc._id)
}

export function useCapture(w: World, s: Search) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const spot = landing(s, w.shelf)
  if (!spot) return null
  return () => {
    const id = `note-${crypto.randomUUID()}`
    fresh.add(id)
    void createNote({id, notebook: spot.notebook, tags: spot.tags, blockId: `${id}-p0`})
      .then(() => refresh(qc, [id]))
      .then(() => navigate({to: '/', search: {...spot.search, n: id}}))
  }
}
