import {useQueryClient} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'
import {addNote, createNoteFn, putNote} from '../lib/library'
import {emptyParagraph} from '../lib/model'
import {enqueue} from '../lib/saver'
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
    addNote(qc, {id, title: '', notebook, tags: [], blocks: [emptyParagraph(blockId)], links: [], updatedAt: new Date().toISOString(), rev: ''})
    enqueue(id, async () => {
      const note = await createNoteFn({data: {id, notebook, blockId}})
      putNote(qc, id, {rev: note.rev})
      return note.rev
    })
    navigate({to: '/', search: {nb: s.nb, tag: s.tag, n: id}})
  }
}
