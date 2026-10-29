import {useQueryClient} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'
import {refresh} from '../lib/library'
import {createNote} from '../replica/local'
import type {Search} from '../lib/scope'
import type {World} from './world'

export function targetNotebook({shelf, lib}: World, s: Search): string | null {
  if (s.nb && shelf.byId.has(s.nb)) return s.nb
  return lib.notebooks.find((nb) => nb.name.toLowerCase() === 'inbox')?.id ?? shelf.roots[0]?.id ?? null
}

export function useCapture(w: World, s: Search) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const notebook = targetNotebook(w, s)
  if (!notebook) return null
  return () => {
    const id = `note-${crypto.randomUUID()}`
    const blockId = `${id}-p0`
    void createNote({id, notebook, blockId})
      .then(() => refresh(qc, [id]))
      .then(() => navigate({to: '/', search: {nb: s.nb, tag: s.tag, n: id}}))
  }
}
