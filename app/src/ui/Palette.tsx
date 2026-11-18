import {useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKey} from 'react'
import {hitLine, snippet, UNTITLED} from '../lib/model'
import {rank, type Pick} from '../lib/palette'
import type {Search} from '../lib/scope'
import {Icon} from './icons'
import {highlight, marker} from './NoteList'
import type {World} from './world'

type Back = {el: HTMLElement; range?: Range}

function remember(): Back | undefined {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || el === document.body) return
  const sel = getSelection()
  const r = sel?.rangeCount ? sel.getRangeAt(0) : undefined
  return {el, range: r && el.isContentEditable && el.contains(r.startContainer) ? r.cloneRange() : undefined}
}

const opensPalette = (e: KeyboardEvent) => e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey

export function usePalette() {
  const [open, setOpen] = useState(false)
  const back = useRef<Back>(undefined)
  const restore = () => {
    const b = back.current
    back.current = undefined
    if (!b?.el.isConnected) return false
    b.el.focus({preventScroll: true})
    if (b.range) getSelection()?.setBaseAndExtent(b.range.startContainer, b.range.startOffset, b.range.endContainer, b.range.endOffset)
    return true
  }
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) restore()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!opensPalette(e)) return
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      if (open) return close(true)
      back.current = remember()
      setOpen(true)
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  }, [open])
  return {open, close, restore}
}

const ICONS = {new: 'plus', tasks: 'tasks', map: 'map', all: 'notes', rail: 'rail', search: 'search'} as const
const KIND = {command: 'Command', notebook: 'Notebook', tag: 'Tag', note: 'Note'}
const STEP: Record<string, number> = {ArrowDown: 1, ArrowUp: -1}
const CTRL_STEP: Record<string, number> = {n: 1, p: -1}

type Props = {w: World; s: Search; canNew: boolean; onPick: (p: Pick) => void; onClose: () => void}

export function Palette({w, s, canNew, onPick, onClose}: Props) {
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const id = useId()
  const {picks, marks} = useMemo(() => rank({q, here: s, notes: w.lib.notes, shelf: w.shelf, tags: w.tags, recents: w.prefs.recents, canNew}), [q, s, w.lib.notes, w.shelf, w.tags, w.prefs.recents, canNew])
  const re = useMemo(() => marker(marks), [marks])
  const i = Math.min(at, picks.length - 1)
  const active = picks[i]
  const opt = (k: number) => `${id}-${k}`
  const recent = !q.trim()

  useEffect(() => void document.getElementById(opt(i))?.scrollIntoView({block: 'nearest'}), [i, picks])

  const onKey = (e: ReactKey<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.nativeEvent.isComposing) return
    const step = STEP[e.key] ?? (e.ctrlKey && !e.metaKey ? CTRL_STEP[e.key] : undefined)
    if (step) (e.preventDefault(), setAt((i + step + picks.length) % picks.length))
    else if (e.key === 'Enter' && active) (e.preventDefault(), onPick(active))
    else if (e.key === 'Escape') (e.preventDefault(), onClose())
    else if (e.key === 'Tab') e.preventDefault()
  }

  return (
    <>
      <div className="pal-scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Go to" data-testid="palette">
        <label className="pal-bar">
          <Icon name="search" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={active && opt(i)}
            aria-autocomplete="list"
            aria-label="Go to a note, notebook, tag or command"
            placeholder="Notes, notebooks, tags, commands"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(e) => (setQ(e.target.value), setAt(0))}
            onKeyDown={onKey}
            data-testid="palette-input"
          />
          <kbd aria-hidden>esc</kbd>
        </label>
        <div className="pal-list" role="listbox" id={`${id}-list`} aria-label="Results">
          {picks.map((p, k) => (
            <div
              key={p.key}
              id={opt(k)}
              role="option"
              aria-selected={k === i}
              className={`pal-row${k === i ? ' on' : ''}`}
              onMouseMove={() => k !== i && setAt(k)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(p)}
              data-testid="palette-pick"
              data-key={p.key}
            >
              <Row p={p} w={w} re={re} marks={marks} />
              <span className="pal-k">{p.key === 'new' ? <kbd>N</kbd> : recent && p.note ? 'Recent' : KIND[p.kind]}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Row({p, w, re, marks}: {p: Pick; w: World; re: RegExp | null; marks: string[]}) {
  const n = p.note
  if (n) {
    const where = w.shelf.path(n.notebook).join(' / ')
    return (
      <>
        <span className="pal-ico">
          <span className="dot" style={{background: w.shelf.colour(n.notebook)}} />
        </span>
        <span className="pal-main">
          <span className={`pal-t${n.title ? '' : ' untitled'}`}>{highlight(n.title || UNTITLED, re)}</span>
          <span className="pal-d">
            {where && <b>{where}</b>}
            {highlight(hitLine(n, marks, w.links.title) ?? snippet(n, w.links.title), re)}
          </span>
        </span>
      </>
    )
  }
  const icon = ICONS[p.key as keyof typeof ICONS]
  return (
    <>
      <span className="pal-ico">{p.kind === 'notebook' ? <span className="dot" style={{background: w.shelf.colour(p.to!.nb!)}} /> : icon ? <Icon name={icon} /> : null}</span>
      <span className="pal-main">
        <span className={`pal-t${p.kind === 'tag' ? ' tag' : ''}`}>{p.label}</span>
        {p.detail && <span className="pal-d">{p.detail}</span>}
      </span>
    </>
  )
}
