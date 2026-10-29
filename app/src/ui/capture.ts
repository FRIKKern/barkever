import {useQueryClient} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'
import {refresh} from '../lib/library'
import {isBlank} from '../lib/model'
import {toNote} from '../lib/note-docs'
import {landing, type Search} from '../lib/scope'
import {db} from '../replica/db'
import {createNote, deleteNote} from '../replica/local'
import type {World} from './world'

const fresh = new Set<string>()

export async function dropIfBlank(id: string) {
  if (!fresh.delete(id)) return
  const doc = await (await db()).get('notes', id)
  if (doc && isBlank(toNote(doc))) await deleteNote(id)
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
