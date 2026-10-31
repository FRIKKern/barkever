import {forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject} from 'react'
import {Link, useNavigate} from '@tanstack/react-router'
import {inHeldOrder} from '../lib/held-order'
import {hitLine, snippet, UNTITLED, type Note} from '../lib/model'
import {scopeName, type Search} from '../lib/scope'
import type {Found} from '../lib/search'
import {groups} from '../lib/versions'
import {when} from '../lib/when'
import {useLeave} from './history'
import {Icon} from './icons'
import type {World} from './world'

const HUB = 3
const PAGE = 100

const marker = (words: string[]) => (words.length ? new RegExp(`(${[...words].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi') : null)

const highlight = (text: string, re: RegExp | null): ReactNode => (re ? text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part)) : text)


const STEP: Record<string, 'nextElementSibling' | 'previousElementSibling'> = {ArrowDown: 'nextElementSibling', ArrowUp: 'previousElementSibling'}

const focusLost = () => {
  const a = document.activeElement
  return !a || a === document.body || !a.checkVisibility()
}

export type ListHandle = {search: () => void; menu: () => void; row: (id: string) => boolean}
type Props = {w: World; s: Search; found: Found; onMenu: () => void; onNew: (() => void) | null; onOpen: (id: string) => void}

export const NoteList = forwardRef<ListHandle, Props>(function NoteList({w, s, found, onMenu, onNew, onOpen}, handle) {
  const {marks: words} = found
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const notes = useHeldOrder(found.notes, rowsRef)
  const [cursor, setCursor] = useState(s.n)
  const active = notes.some((n) => n.id === cursor) ? cursor : notes[0]?.id
  const rowEl = (id?: string) => (id ? rowsRef.current?.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(id)}"]`) : null)

  useImperativeHandle(handle, () => ({
    search: () => searchRef.current?.focus(),
    menu: () => menuRef.current?.focus(),
    row: (id) => {
      const el = rowEl(id) ?? rowEl(active)
      if (!el?.checkVisibility()) return false
      el.focus()
      return true
    },
  }))

  useEffect(() => {
    if (!s.n) return
    setCursor(s.n)
    rowEl(s.n)?.scrollIntoView({block: 'nearest'})
  }, [s.n])
  useLeave(s.n, (left) => !s.n && focusLost() && rowEl(left)?.focus())

  const onKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-note-id]')
    const step = STEP[e.key]
    if (row && step) (e.preventDefault(), (row[step] as HTMLElement | null)?.focus())
    else if (row && e.key === 'Enter') {
      e.preventDefault()
      navigate({to: '/', search: {...s, n: row.dataset.noteId}})
      onOpen(row.dataset.noteId!)
    }
  }
  const [q, setQ] = useState(s.q ?? '')
  useEffect(() => setQ(s.q ?? ''), [s.q])
  const searching = !!s.q?.trim()
  const scopeDot = !searching && s.nb
  const {shown, more} = useShown(notes, s, rowsRef)
  const re = useMemo(() => marker(words), [words])
  const setQuery = (v: string) => {
    setQ(v)
    navigate({to: '/', search: (prev: Search) => ({...prev, q: v || undefined}), replace: true})
  }
  return (
    <section className="list" aria-label="Notes">
      <div className="mhead">
        <button ref={menuRef} className="icon-btn" onClick={onMenu} aria-label="Notebooks" aria-haspopup="dialog">
          <Icon name="menu" />
        </button>
        <span className="mt">{scopeName(s, w.shelf)}</span>
        <button className="icon-btn" onClick={onNew ?? undefined} aria-label="New note">
          <Icon name="plus" />
        </button>
      </div>
      <div className="bar">
        <label className="search">
          <Icon name="search" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search notes"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search notes"
            value={q}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            data-testid="search"
          />
          <kbd aria-hidden>/</kbd>
        </label>
      </div>
      <div className="list-h" data-testid="list-head">
        {scopeDot && <span className="dot" style={{background: w.shelf.colour(s.nb!)}} />}
        <b>{scopeName(s, w.shelf)}</b>
        <span>
          {notes.length} note{notes.length === 1 ? '' : 's'}
        </span>
        <span className="sort">{searching ? 'Best match' : 'Recent ↓'}</span>
      </div>
      <div className="rows" role="listbox" aria-label="Notes" ref={rowsRef} onKeyDown={onKeys}>
        {notes.length === 0 && <div className="empty">{searching ? `Nothing matches “${s.q}”.` : 'No notes here yet. Press N to write one.'}</div>}
        {shown.map((n) => {
          const d = w.links.degree(n.id)
          const nb = w.shelf.byId.get(n.notebook ?? '')
          return (
            <Link key={n.id} to="/" search={{...s, n: n.id}} className={`row${n.id === s.n ? ' sel' : ''}`} role="option" aria-selected={n.id === s.n} tabIndex={n.id === active ? 0 : -1} onFocus={() => setCursor(n.id)} data-testid="note-row" data-note-id={n.id}>
              <div className="row-top">
                <span className={`row-title${n.title ? '' : ' untitled'}`} data-testid="note-title">
                  {highlight(n.title || UNTITLED, re)}
                </span>
                <span className="row-date">{when(n.updatedAt)}</span>
              </div>
              <div className="row-bot">
                <span className="dot" style={{background: w.shelf.colour(n.notebook)}} title={nb?.name} data-testid="note-notebook" data-notebook={nb?.name ?? ''} />
                <span className="row-snip">{highlight(hitLine(n, words, w.links.title) ?? snippet(n, w.links.title), re)}</span>
                {n.conflicts.length > 0 && <span className="row-clash" title="Kept both versions" data-testid="note-conflict">{groups(n.conflicts).length + 1} versions</span>}
                {d > 0 && (
                  <span className={`lk${d >= HUB ? ' hub' : ''}`} title={`${d} linked notes`}>
                    <Icon name="link" />
                    {d}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
        {more && <div className="more" data-more />}
      </div>
    </section>
  )
})

function useHeldOrder(notes: Note[], rows: RefObject<HTMLDivElement | null>): Note[] {
  const [held, setHeld] = useState<Note[] | null>(null)
  const latest = useRef(notes)
  latest.current = notes
  useEffect(() => {
    const el = rows.current!
    let press: AbortController | undefined
    const down = () => {
      press?.abort()
      const mine = (press = new AbortController())
      setHeld(latest.current)
      const up = () => (mine.abort(), setTimeout(() => press === mine && setHeld(null)))
      for (const type of ['pointerup', 'pointercancel']) addEventListener(type, up, {capture: true, signal: mine.signal})
    }
    el.addEventListener('pointerdown', down)
    return () => (el.removeEventListener('pointerdown', down), press?.abort())
  }, [rows])
  return useMemo(() => (held ? inHeldOrder(held, notes) : notes), [held, notes])
}

function useShown(notes: Note[], s: Search, rows: RefObject<HTMLDivElement | null>): {shown: Note[]; more: boolean} {
  const [pages, setPages] = useState(1)
  useEffect(() => setPages(1), [s.q, s.nb, s.tag])
  const count = pages * PAGE
  const more = count < notes.length
  useEffect(() => {
    const end = rows.current?.querySelector('[data-more]')
    if (!end) return
    const seen = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setPages((p) => p + 1), {root: rows.current, rootMargin: '600px'})
    seen.observe(end)
    return () => seen.disconnect()
  }, [count, notes])
  const first = notes.slice(0, count)
  const open = s.n && !first.some((n) => n.id === s.n) ? notes.find((n) => n.id === s.n) : undefined
  return {shown: open ? [...first, open] : first, more}
}
