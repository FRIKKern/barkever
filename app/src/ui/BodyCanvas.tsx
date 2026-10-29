import {useEffect, useImperativeHandle, useRef, useState, type Ref} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {loadCanvas, vocabulary, type CanvasElement, type CanvasOps} from '../lib/canvas-load'
import type {Note} from '../lib/model'
import {markClean, markDirty} from '../lib/saver'
import {editBody} from '../replica/local'
import {same} from '../replica/merge'
import type {Search} from '../lib/scope'
import {Blocks} from './Blocks'

export type BodyHandle = {focus: () => void}
type Props = {note: Note; s: Search; handle: Ref<BodyHandle>}

export function BodyCanvas({note, s, handle}: Props) {
  const navigate = useNavigate()
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<CanvasElement | null>(null)
  const agreed = useRef(note.blocks)
  const [state, setState] = useState<{live: boolean; blocked?: string}>({live: false})
  const id = note.id

  useImperativeHandle(handle, () => ({focus: () => canvas.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus()}), [])

  useEffect(() => {
    let gone = false
    const onOps = (e: Event) => {
      const el = e.currentTarget as CanvasElement
      const {seq, ops} = (e as CustomEvent<CanvasOps>).detail
      const requestId = `local-${seq}`
      el.identifyOpsRequest(seq, requestId)
      el.acknowledgeOps(seq, true)
      const after = structuredClone(el.blocks)
      void editBody(id, ops, after).then((saved) => {
        markClean(id)
        if (!saved) return
        const others = !same(saved.before, agreed.current)
        agreed.current = saved.blocks
        el.applyServerBlocks(others ? saved.blocks : after, {mode: 'own', requestId})
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
    const flush = () => canvas.current?.flushPendingChanges()
    addEventListener('pagehide', flush)
    return () => {
      gone = true
      removeEventListener('pagehide', flush)
      flush()
      canvas.current?.remove()
      canvas.current = null
    }
  }, [id])

  useEffect(() => {
    if (note.gen) canvas.current?.applyServerBlocks(note.blocks)
  }, [note.gen])

  return (
    <div className={`doc-body${state.live ? ' live' : ''}`} ref={host} data-testid="body">
      {state.blocked && <div className="canvas-note">Read only: the editor could not load ({state.blocked}).</div>}
      <Blocks blocks={note.blocks} s={s} />
    </div>
  )
}
