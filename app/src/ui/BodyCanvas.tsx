import {useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject} from 'react'
import {useNavigate} from '@tanstack/react-router'
import {linkAtCaret, loadCanvas, readTyping, vocabulary, type CanvasElement, type CanvasOps} from '../lib/canvas-load'
import {findLine, type Spot} from '../lib/board'
import type {Linker} from '../lib/link-pick'
import {wikilinks, type Note} from '../lib/model'
import {markDirty, markSaved, savePoint} from '../lib/saver'
import {editBody} from '../replica/local'
import type {Search} from '../lib/scope'
import {Blocks} from './Blocks'

export type BodyHandle = {focus: () => void}
type Props = {note: Note; s: Search; handle: Ref<BodyHandle>; linker: Linker}

const FLUSH_MS = 40
const WORDS = JSON.stringify({'Link to page': 'Link to note', 'No matching pages': 'No matching notes'})

export function BodyCanvas({note, s, handle, linker}: Props) {
  const navigate = useNavigate()
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<CanvasElement | null>(null)
  const latest = useRef(note)
  latest.current = note
  const line = useRef(s.line)
  line.current = s.line
  const links = useRef(linker)
  links.current = linker
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
    let composing = false
    const onOps = (e: Event) => {
      const el = e.currentTarget as CanvasElement
      const {seq} = (e as CustomEvent<CanvasOps>).detail
      const requestId = `local-${seq}`
      if (line.current) navigate({to: '/', search: (prev: Search) => ({...prev, line: undefined}), replace: true})
      const base = structuredClone(el.blocks)
      const upTo = savePoint(id, 'body')
      el.identifyOpsRequest(seq, requestId)
      el.acknowledgeOps(seq, true)
      void editBody(id, base, structuredClone(el.blocks)).then((saved) => {
        markSaved(id, 'body', upTo)
        if (saved) el.applyServerBlocks(saved, {mode: 'own', requestId})
      })
    }
    const onInput = () => {
      markDirty(id, 'body')
      flushing ??= setTimeout(() => {
        flushing = undefined
        const upTo = savePoint(id, 'body')
        flush()
        if (!composing) markSaved(id, 'body', upTo)
      }, FLUSH_MS)
    }
    const onCompose = (e: Event) => {
      composing = e.type === 'compositionstart'
      if (!composing) onInput()
    }
    const live = (to: string | null | undefined): to is string => !!to && !('missing' in links.current.resolve(to))
    const go = (to: string) => navigate({to: '/', search: (prev: Search) => ({...prev, n: to})})
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{kind?: string; docId?: string; target?: string}>).detail
      if (d.kind === 'link') return
      e.preventDefault()
      const to = d.docId || d.target
      if (to) go(to)
    }
    const onClick = (e: Event) => {
      const d = (e as CustomEvent<{docId: string | null; target: string | null}>).detail
      const to = d.docId || d.target
      if (live(to)) (e.preventDefault(), go(to))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return
      const to = linkAtCaret(e.currentTarget as CanvasElement)
      if (live(to)) (e.preventDefault(), go(to))
    }
    loadCanvas().then(
      () => {
        if (gone || !host.current) return
        const el = document.createElement('bp-paper-canvas') as CanvasElement
        el.acknowledgedSaves = true
        el.blocks = latest.current.blocks
        el.wikilinkSource = (q) => links.current.pick(q)
        el.linkPreviewSource = ({kind, docId, target}) => (kind === 'wikilink' ? links.current.preview(docId || target || '') : null)
        el.wikilinkResolve = (to) => links.current.resolve(to)
        el.setAttribute('editable', 'true')
        el.setAttribute('mention-trigger', 'off')
        el.setAttribute('data-strings', WORDS)
        el.setAttribute('data-vocabulary', vocabulary)
        el.addEventListener('bp-canvas-ops', onOps)
        el.addEventListener('bp-canvas-open-link', onOpen)
        el.addEventListener('bp-canvas-wikilink-click', onClick)
        el.addEventListener('input', onInput)
        el.addEventListener('keydown', onKey)
        el.addEventListener('compositionstart', onCompose)
        el.addEventListener('compositionend', onCompose)
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

  const spot = findLine(note.blocks, s.line)

  const targets = JSON.stringify(wikilinks(note.blocks).map((t) => [t, linker.resolve(t)]))
  useEffect(() => canvas.current?.refreshWikilinks(), [targets])

  return (
    <div className={`doc-body${state.live ? ' live' : ''}`} ref={host} data-testid="body">
      {spot === 'gone' && (
        <div className="canvas-note" data-testid="line-gone">
          That line has moved or been deleted.
        </div>
      )}
      {spot && spot !== 'gone' && <LineMark spot={spot} line={s.line!} host={host} surface={state.live ? 'bp-paper-canvas' : state.blocked ? '.blocks' : undefined} />}
      {state.blocked && <div className="canvas-note">Read only: the editor could not load ({state.blocked}).</div>}
      <Blocks blocks={note.blocks} s={s} title={linker.title} />
    </div>
  )
}

function LineMark({spot, line, host, surface}: {spot: Spot; line: string; host: RefObject<HTMLDivElement | null>; surface?: string}) {
  const mark = `[data-bp-id="${CSS.escape(spot.block)}"] > li:nth-child(${spot.item + 1})`
  const latest = useRef(mark)
  latest.current = mark
  useEffect(() => {
    if (surface) host.current!.querySelector(`${surface} ${latest.current}`)?.scrollIntoView({block: 'center'})
  }, [line, surface])
  return <style>{`.doc-body ${mark} { background: var(--c-mark); border-radius: var(--r-s); }`}</style>
}
