import {useEffect, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {Link, useNavigate} from '@tanstack/react-router'
import {flipShortcut} from '../lib/library'
import type {Note} from '../lib/model'
import type {Reach} from '../lib/online'
import {markDirty, markSaved, useSaveStatus} from '../lib/saver'
import {deleteNote, editTitle, savedTitle} from '../replica/local'
import {scopeName, type Search} from '../lib/scope'
import {when} from '../lib/when'
import {BodyCanvas, type BodyHandle} from './BodyCanvas'
import {ConflictView} from './ConflictView'
import {Icon} from './icons'
import {NotebookPick, TagEdit} from './Organize'
import type {World} from './world'

const LABEL = {saved: 'Saved', saving: 'Saving…', offline: 'Offline · saved on this device', unreachable: 'Saved on this device'}

type Props = {w: World; s: Search; note: Note; reach: Reach; focusTitle?: {id: string}; onBack: () => void; onEscape: () => void; onRail: () => void}

export function Editor({w, s, note, reach, focusTitle, onBack, onEscape, onRail}: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [title, setTitle] = useState(note.title)
  const status = useSaveStatus(note.id, reach)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const body = useRef<BodyHandle>(null)
  const writing = useRef(0)
  const keys = useRef(0)

  const adopt = () => {
    const at = keys.current
    void savedTitle(note.id).then((t) => at === keys.current && setTitle(t))
  }
  useEffect(adopt, [note.gen])

  useEffect(() => {
    if (focusTitle || !note.title) titleRef.current?.focus()
  }, [focusTitle])

  const onTitle = (v: string) => {
    const value = v.replace(/\n/g, ' ')
    const shown = title
    setTitle(value)
    markDirty(note.id)
    keys.current++
    writing.current++
    void editTitle(note.id, shown, value).then(() => --writing.current || markSaved(qc, note.id))
  }

  const label = LABEL[status]
  const remove = () => {
    void deleteNote(note.id).then(() => navigate({to: '/', search: {...s, n: undefined}}))
  }
  const path = w.shelf.path(note.notebook)
  const starred = w.prefs.shortcuts.includes(note.id)
  const ins = w.links.backs(note.id).length
  const outs = w.links.outs(note.id).length

  return (
    <main className="editor" aria-label="Note" data-note-id={note.id} onKeyDown={(e) => e.key === 'Escape' && !e.defaultPrevented && (e.preventDefault(), onEscape())}>
      <div className="mhead">
        <Link className="back" to="/" search={{...s, n: undefined}} replace onClick={(e) => (e.preventDefault(), onBack())}>
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
          <button className="icon-btn" onClick={remove} title="Delete note" aria-label="Delete note" data-testid="delete-note">
            <Icon name="trash" />
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
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), body.current?.focus())}
            spellCheck={false}
            aria-label="Title"
            data-testid="title"
          />
          <div className="doc-meta">
            <NotebookPick w={w} note={note} />
            <TagEdit w={w} note={note} />
            <span>Edited {when(note.updatedAt)}</span>
            <span className={`lk${ins + outs >= 3 ? ' hub' : ''}`}>
              <Icon name="link" />
              {ins} in · {outs} out
            </span>
          </div>
          <ConflictView note={note} />
          <BodyCanvas note={note} s={s} handle={body} />
        </article>
      </div>
    </main>
  )
}
