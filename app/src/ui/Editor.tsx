import {useEffect, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {Link} from '@tanstack/react-router'
import {flipShortcut, putNote, setTitleFn} from '../lib/library'
import type {Note} from '../lib/model'
import {enqueue, knowRev, markDirty, useSaveStatus} from '../lib/saver'
import {scopeName, type Search} from '../lib/scope'
import {when} from '../lib/when'
import {BodyCanvas, type BodyHandle} from './BodyCanvas'
import {Icon} from './icons'
import type {World} from './world'

const TITLE_DEBOUNCE_MS = 300
const LABEL = {saved: 'Saved', saving: 'Saving…', failed: 'Not saved'}

type Props = {w: World; s: Search; note: Note; online: boolean; onRail: () => void}

export function Editor({w, s, note, online, onRail}: Props) {
  const qc = useQueryClient()
  knowRev(note.id, note.rev)
  const [title, setTitle] = useState(note.title)
  const status = useSaveStatus(note.id)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const body = useRef<BodyHandle>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef(title)

  const flush = () => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    const value = latest.current
    putNote(qc, note.id, {title: value, updatedAt: new Date().toISOString()})
    enqueue(note.id, async () => (await setTitleFn({data: {id: note.id, title: value}})).rev)
  }

  useEffect(() => {
    if (!note.title) titleRef.current?.focus()
    return flush
  }, [])

  const onTitle = (v: string) => {
    const value = v.replace(/\n/g, ' ')
    setTitle(value)
    latest.current = value
    markDirty(note.id)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, TITLE_DEBOUNCE_MS)
  }

  const label = status === 'failed' && !online ? 'Offline · not saved' : LABEL[status]
  const path = w.shelf.path(note.notebook)
  const starred = w.prefs.shortcuts.includes(note.id)
  const ins = w.links.backs(note.id).length
  const outs = w.links.outs(note.id).length

  return (
    <main className="editor" aria-label="Note">
      <div className="mhead">
        <Link className="back" to="/" search={{...s, n: undefined}}>
          <Icon name="back" />
          {scopeName(s, w.shelf)}
        </Link>
        <span className={`saved ${status}`}>{label}</span>
      </div>
      <div className="bar ed-bar">
        <div className="crumb">
          <span className="dot" style={{background: w.shelf.colour(note.notebook)}} />
          {path.join(' › ')}
        </div>
        <div className="ed-actions">
          <span className={`saved ${status}`} data-testid="save-status" aria-live="polite">
            {label}
          </span>
          <button className="icon-btn" onClick={() => flipShortcut(qc, note.id)} aria-pressed={starred} title={starred ? 'Remove from Shortcuts' : 'Add to Shortcuts'} data-testid="star">
            <Icon name="star" />
          </button>
          <button className="icon-btn" onClick={onRail} title="Connections" aria-label="Toggle connections">
            <Icon name="rail" />
          </button>
        </div>
      </div>
      <div className="ed-scroll">
        <article className="doc">
          <textarea
            ref={titleRef}
            className="doc-title"
            rows={1}
            placeholder="Untitled"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), flush(), body.current?.focus())}
            onBlur={flush}
            spellCheck={false}
            aria-label="Title"
            data-testid="title"
          />
          <div className="doc-meta">
            <span className="nbchip">
              <span className="dot" style={{background: w.shelf.colour(note.notebook)}} />
              {path.at(-1) ?? 'No notebook'}
            </span>
            {note.tags.map((t) => (
              <Link key={t} className="tag" to="/" search={{tag: t, n: note.id}}>
                #{t}
              </Link>
            ))}
            <span>Edited {when(note.updatedAt)}</span>
            <span className={`lk${ins + outs >= 3 ? ' hub' : ''}`}>
              <Icon name="link" />
              {ins} in · {outs} out
            </span>
          </div>
          <BodyCanvas note={note} s={s} handle={body} />
        </article>
      </div>
    </main>
  )
}
