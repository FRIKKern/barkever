import {useEffect, useImperativeHandle, useRef, useState, type Ref} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'
import {loadCanvas, readTyping, vocabulary, type CanvasElement, type CanvasOps} from '../lib/canvas-load'
import type {Candidate} from '../lib/link-pick'
import type {Note} from '../lib/model'
import {markDirty, markSaved} from '../lib/saver'
import {editBody} from '../replica/local'
import type {Search} from '../lib/scope'
import {Blocks} from './Blocks'

export type BodyHandle = {focus: () => void}
type Props = {note: Note; s: Search; handle: Ref<BodyHandle>; pick: (query: string) => Candidate[]}

const FLUSH_MS = 40
const WORDS = JSON.stringify({'Link to page': 'Link to note', 'No matching pages': 'No matching notes'})

export function BodyCanvas({note, s, handle, pick}: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<CanvasElement | null>(null)
  const latest = useRef(note)
  latest.current = note
  const picker = useRef(pick)
  picker.current = pick
  const wantFocus = useRef(false)
  const [state, setState] = useState<{live: boolean; blocked?: string}>({live: false})
  const id = note.id

  const focusCanvas = () => canvas.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus()
  useImperativeHandle(handle, () => ({focus: () => (canvas.current ? focusCanvas() : (wantFocus.current = true))}), [])

  const flush = () => {
    if (!canvas.current) return
    readTyping(canvas.current)
    canvas.current.flushPendingChanges()
  }

  useEffect(() => {
    let gone = false
    let flushing: ReturnType<typeof setTimeout> | undefined
    const onOps = (e: Event) => {
      const el = e.currentTarget as CanvasElement
      const {seq} = (e as CustomEvent<CanvasOps>).detail
      const requestId = `local-${seq}`
      const base = structuredClone(el.blocks)
      el.identifyOpsRequest(seq, requestId)
      el.acknowledgeOps(seq, true)
      void editBody(id, base, structuredClone(el.blocks)).then((saved) => {
        markSaved(qc, id)
        if (saved) el.applyServerBlocks(saved, {mode: 'own', requestId})
      })
    }
    const onInput = () => {
      markDirty(id)
      flushing ??= setTimeout(() => {
        flushing = undefined
        flush()
      }, FLUSH_MS)
    }
    const go = (to: string) => navigate({to: '/', search: (prev: Search) => ({...prev, n: to})})
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{kind?: string; docId?: string; target?: string}>).detail
      const to = d.docId || d.target
      if (d.kind === 'link' || !to) return
      e.preventDefault()
      go(to)
    }
    const onClick = (e: Event) => {
      const d = (e as CustomEvent<{docId: string | null; target: string | null}>).detail
      const to = d.docId || d.target
      if (to) (e.preventDefault(), go(to))
    }
    loadCanvas().then(
      () => {
        if (gone || !host.current) return
        const el = document.createElement('bp-paper-canvas') as CanvasElement
        el.acknowledgedSaves = true
        el.blocks = latest.current.blocks
        el.wikilinkSource = (q) => picker.current(q)
        el.setAttribute('editable', 'true')
        el.setAttribute('mention-trigger', 'off')
        el.setAttribute('data-strings', WORDS)
        el.setAttribute('data-vocabulary', vocabulary)
        el.addEventListener('bp-canvas-ops', onOps)
        el.addEventListener('bp-canvas-open-link', onOpen)
        el.addEventListener('bp-canvas-wikilink-click', onClick)
        el.addEventListener('input', onInput)
        el.dataset.testid = 'canvas'
        host.current.append(el)
        canvas.current = el
        setState({live: true})
        if (wantFocus.current) focusCanvas()
      },
      (e: Error) => !gone && setState({live: false, blocked: e.message}),
    )
    addEventListener('pagehide', flush)
    return () => {
      gone = true
      clearTimeout(flushing)
      removeEventListener('pagehide', flush)
      flush()
      canvas.current?.remove()
      canvas.current = null
    }
  }, [id])

  useEffect(() => {
    if (!note.gen || !canvas.current) return
    readTyping(canvas.current)
    canvas.current.applyServerBlocks(note.blocks)
  }, [note.gen])

  return (
    <div className={`doc-body${state.live ? ' live' : ''}`} ref={host} data-testid="body">
      {state.blocked && <div className="canvas-note">Read only: the editor could not load ({state.blocked}).</div>}
      <Blocks blocks={note.blocks} s={s} />
    </div>
  )
}
