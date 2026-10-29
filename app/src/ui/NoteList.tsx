import {forwardRef, useEffect, useState, type ReactNode} from 'react'
import {Link, useNavigate} from '@tanstack/react-router'
import {blockText, snippet, UNTITLED, type Note} from '../lib/model'
import {scopeName, terms, type Search} from '../lib/scope'
import {when} from '../lib/when'
import {Icon} from './icons'
import type {World} from './world'

const HUB = 3

function highlight(text: string, words: string[]): ReactNode {
  if (!words.length) return text
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))
}

const hitLine = (n: Note, words: string[]) => (words.length ? n.blocks.map(blockText).find((t) => words.some((w) => t.toLowerCase().includes(w))) : undefined)

type Props = {w: World; s: Search; notes: Note[]; onMenu: () => void; onNew: (() => void) | null}

export const NoteList = forwardRef<HTMLInputElement, Props>(function NoteList({w, s, notes, onMenu, onNew}, searchRef) {
  const navigate = useNavigate()
  const [q, setQ] = useState(s.q ?? '')
  useEffect(() => setQ(s.q ?? ''), [s.q])
  const words = terms(s.q)
  const scopeDot = !words.length && s.nb
  const setQuery = (v: string) => {
    setQ(v)
    navigate({to: '/', search: (prev: Search) => ({...prev, q: v || undefined}), replace: true})
  }
  return (
    <section className="list" aria-label="Notes">
      <div className="mhead">
        <button className="icon-btn" onClick={onMenu} aria-label="Notebooks">
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
            value={q}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            data-testid="search"
          />
          <kbd>/</kbd>
        </label>
      </div>
      <div className="list-h" data-testid="list-head">
        {scopeDot && <span className="dot" style={{background: w.shelf.colour(s.nb!)}} />}
        <b>{scopeName(s, w.shelf)}</b>
        <span>
          {notes.length} note{notes.length === 1 ? '' : 's'}
        </span>
        <span className="sort">Recent ↓</span>
      </div>
      <div className="rows" role="listbox" aria-label="Notes">
        {notes.length === 0 && <div className="empty">{words.length ? `Nothing matches “${s.q}”.` : 'No notes here yet. Press N to write one.'}</div>}
        {notes.map((n) => {
          const d = w.links.degree(n.id)
          const nb = w.shelf.byId.get(n.notebook ?? '')
          return (
            <Link key={n.id} to="/" search={{...s, n: n.id}} className={`row${n.id === s.n ? ' sel' : ''}`} role="option" aria-selected={n.id === s.n} data-testid="note-row" data-note-id={n.id}>
              <div className="row-top">
                <span className={`row-title${n.title ? '' : ' untitled'}`} data-testid="note-title">
                  {highlight(n.title || UNTITLED, words)}
                </span>
                <span className="row-date">{when(n.updatedAt)}</span>
              </div>
              <div className="row-bot">
                <span className="dot" style={{background: w.shelf.colour(n.notebook)}} title={nb?.name} data-testid="note-notebook" data-notebook={nb?.name ?? ''} />
                <span className="row-snip">{highlight(hitLine(n, words) ?? snippet(n), words)}</span>
                {n.conflicts.length > 0 && <span className="row-clash" title="Kept both versions" data-testid="note-conflict">{n.conflicts.length + 1} versions</span>}
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
      </div>
    </section>
  )
})
