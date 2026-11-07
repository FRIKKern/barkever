import {useQueryClient} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'
import {refresh} from '../lib/library'
import {landing, type Search} from '../lib/scope'
import {createNote} from '../replica/local'
import type {World} from './world'

export function useCapture(w: World, s: Search) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const spot = landing(s, w.shelf)
  if (!spot) return null
  return () => {
    const id = `note-${crypto.randomUUID()}`
    void createNote({id, notebook: spot.notebook, tags: spot.tags, blockId: `${id}-p0`})
      .then(() => refresh(qc, [id]))
      .then(() => navigate({to: '/', search: {...spot.search, n: id}}))
      .catch((e: unknown) => console.warn('capture: the new note could not be made', e))
  }
}
