import {useEffect, useImperativeHandle, useRef, useState, type Ref} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'
import {libraryQuery, putNote, saveBodyFn} from '../lib/library'
import {loadCanvas, vocabulary, type CanvasElement, type CanvasOps} from '../lib/canvas-load'
import type {Library, Note} from '../lib/model'
import {enqueue, markDirty} from '../lib/saver'
import type {Search} from '../lib/scope'
import {Blocks} from './Blocks'

export type BodyHandle = {focus: () => void}
type Props = {note: Note; s: Search; handle: Ref<BodyHandle>}

export function BodyCanvas({note, s, handle}: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<CanvasElement | null>(null)
  const [state, setState] = useState<{live: boolean; blocked?: string}>({live: false})
  const id = note.id

  useImperativeHandle(handle, () => ({focus: () => canvas.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus()}), [])

  useEffect(() => {
    let gone = false
    const storedLinks = () => qc.getQueryData<Library>(libraryQuery.queryKey)?.notes.find((n) => n.id === id)?.links ?? []
    const onOps = (e: Event) => {
      const el = e.currentTarget as CanvasElement
      const {ops, seq} = (e as CustomEvent<CanvasOps>).detail
      const requestId = `http-${seq}`
      el.identifyOpsRequest(seq, requestId)
      enqueue(id, async (rev) => {
        const r = await saveBodyFn({data: {id, ops, rev, links: storedLinks()}}).catch((err: Error) => ({ok: false as const, status: 0, error: err.message}))
        if (!r.ok) {
          el.discardInflightOps(seq, {reason: r.error})
          return null
        }
        el.applyServerBlocks(r.blocks, {mode: 'own', requestId})
        el.acknowledgeOps(seq, true)
        putNote(qc, id, {blocks: r.blocks, links: r.links, rev: r.rev, updatedAt: new Date().toISOString()})
        return r.rev
      })
    }
    const go = (to: string) => navigate({to: '/', search: (prev: Search) => ({...prev, n: to})})
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{kind?: string; docId?: string; target?: string}>).detail
      const to = d.docId || d.target
      if (d.kind === 'link' || !to) return
      e.preventDefault()
      go(to)
    }
    const onClick = (e: MouseEvent) => {
      const to = (e.target as Element).closest('[data-wikilink]')?.getAttribute('docid')
      if (to) (e.preventDefault(), go(to))
    }
    loadCanvas().then(
      () => {
        if (gone || !host.current) return
        const el = document.createElement('bp-paper-canvas') as CanvasElement
        el.acknowledgedSaves = true
        el.blocks = note.blocks
        el.setAttribute('editable', 'true')
        el.setAttribute('data-vocabulary', vocabulary)
        el.addEventListener('bp-canvas-ops', onOps)
        el.addEventListener('bp-canvas-open-link', onOpen)
        el.addEventListener('click', onClick)
        el.addEventListener('input', () => markDirty(id))
        el.dataset.testid = 'canvas'
        host.current.append(el)
        canvas.current = el
        setState({live: true})
      },
      (e: Error) => !gone && setState({live: false, blocked: e.message}),
    )
    return () => {
      gone = true
      canvas.current?.remove()
      canvas.current = null
    }
  }, [id])

  return (
    <div className={`doc-body${state.live ? ' live' : ''}`} ref={host} data-testid="body">
      {state.blocked && <div className="canvas-note">Read only: the editor could not load ({state.blocked}).</div>}
      <Blocks blocks={note.blocks} s={s} />
    </div>
  )
}
