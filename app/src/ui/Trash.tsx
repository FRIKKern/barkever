import {forwardRef, useEffect, useImperativeHandle, useRef} from 'react'
import {Link, useNavigate} from '@tanstack/react-router'
import {snippet, UNTITLED, type Note} from '../lib/model'
import {recorded} from '../lib/saver'
import {scopeName, type Search} from '../lib/scope'
import {emptyAsk, foreverAsk, linkedFrom} from '../lib/trash'
import {when} from '../lib/when'
import {deleteNote, restoreNote} from '../replica/local'
import {Blocks} from './Blocks'
import type {BackStep} from './history'
import {Icon} from './icons'
import type {World} from './world'

const NOTICE_MS = 8000

export type TrashHandle = {menu: () => void}
type ListProps = {w: World; s: Search; onMenu: () => void}

function useTrashActions(w: World, s: Search) {
  const navigate = useNavigate()
  const restore = (id: string) =>
    void recorded(id, restoreNote(id).then(() => true)).then((done) => {
      if (done && s.n === id) void navigate({to: '/', search: {n: id}})
    })
  const forever = (n: Note) => {
    if (!confirm(foreverAsk(n, linkedFrom(w.lib.notes, n.id)))) return
    void recorded(n.id, deleteNote(n.id).then(() => true)).then((done) => {
      if (done && s.n === n.id) void navigate({to: '/', search: {...s, n: undefined}})
    })
  }
  return {restore, forever}
}

export const TrashList = forwardRef<TrashHandle, ListProps>(function TrashList({w, s, onMenu}, handle) {
  const menuRef = useRef<HTMLButtonElement>(null)
  useImperativeHandle(handle, () => ({menu: () => menuRef.current?.focus()}))
  const navigate = useNavigate()
  const {restore, forever} = useTrashActions(w, s)
  const trash = w.trash
  const empty = async () => {
    const all = [...trash]
    if (!all.length || !confirm(emptyAsk(all.length))) return
    for (const n of all) await recorded(n.id, deleteNote(n.id))
    if (s.n) void navigate({to: '/', search: {view: 'trash'}})
  }
  return (
    <section className="list" aria-label="Trash">
      <div className="mhead">
        <button ref={menuRef} className="icon-btn" onClick={onMenu} aria-label="Notebooks" aria-haspopup="dialog">
          <Icon name="menu" />
        </button>
        <span className="mt">Trash</span>
      </div>
      <div className="list-h" data-testid="list-head">
        <b>Trash</b>
        <span>
          {trash.length} note{trash.length === 1 ? '' : 's'}
        </span>
        <button className="btn trash-empty" onClick={() => void empty()} disabled={!trash.length} data-testid="trash-empty">
          Empty Trash
        </button>
      </div>
      <div className="rows" role="list" aria-label="Notes in Trash">
        {trash.length === 0 && <div className="empty">Trash is empty. Deleted notes wait here until you restore them.</div>}
        {trash.map((n) => (
          <div key={n.id} role="listitem" className={`row trash-row${n.id === s.n ? ' sel' : ''}`} data-testid="trash-row" data-note-id={n.id}>
            <Link to="/" search={{view: 'trash', n: n.id}} className="trash-open">
              <div className="row-top">
                <span className={`row-title${n.title ? '' : ' untitled'}`} data-testid="note-title">
                  {n.title || UNTITLED}
                </span>
                <span className="row-date" title="Moved to Trash">
                  {when(n.trashed ?? '')}
                </span>
              </div>
              <div className="row-bot">
                <span className="dot" style={{background: w.shelf.colour(n.notebook)}} />
                <span className="row-snip">{snippet(n, w.links.title)}</span>
              </div>
            </Link>
            <div className="trash-acts">
              <button className="btn" onClick={() => restore(n.id)} data-testid="trash-restore">
                Restore
              </button>
              <button className="btn danger" onClick={() => forever(n)} data-testid="trash-forever">
                Delete forever
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
})

export function TrashedNote({w, s, note, back}: {w: World; s: Search; note: Note; back: BackStep}) {
  const {restore, forever} = useTrashActions(w, s)
  const path = w.shelf.path(note.notebook)
  return (
    <main className="editor" aria-label="Note" data-note-id={note.id} data-testid="trashed-note" onKeyDown={(e) => e.key === 'Escape' && !e.defaultPrevented && (e.preventDefault(), back.go())}>
      <div className="mhead">
        <Link className="back" to="/" search={back.to} replace onClick={(e) => (e.preventDefault(), back.go())}>
          <Icon name="back" />
          {scopeName(back.to, w.shelf)}
        </Link>
      </div>
      <div className="trash-bar" role="status" data-testid="trash-bar">
        <Icon name="trash" />
        <span className="t">In Trash since {when(note.trashed ?? '')}. Restore it to edit.</span>
        <button className="btn primary" onClick={() => restore(note.id)} data-testid="trashed-restore">
          Restore
        </button>
        <button className="btn danger" onClick={() => forever(note)} data-testid="trashed-forever">
          Delete forever
        </button>
      </div>
      <div className="ed-scroll">
        <article className="doc">
          <h1 className="doc-title" data-testid="title">
            {note.title || UNTITLED}
          </h1>
          <div className="doc-meta">
            <span className="nbchip">
              <span className="dot" style={{background: w.shelf.colour(note.notebook)}} />
              {path.join(' › ') || 'No notebook'}
            </span>
            {note.tags.map((t) => (
              <span key={t} className="tag">
                #{t}
              </span>
            ))}
            <span>Edited {when(note.updatedAt)}</span>
          </div>
          <div className="doc-body">
            <Blocks blocks={note.blocks} s={{...s, view: undefined}} title={w.links.title} />
          </div>
        </article>
      </div>
    </main>
  )
}

export function TrashNotice({id, onUndo, onDone}: {id: string; onUndo: () => void; onDone: () => void}) {
  useEffect(() => {
    const t = setTimeout(onDone, NOTICE_MS)
    return () => clearTimeout(t)
  }, [id])
  return (
    <div className="trash-notice" role="status" data-testid="trash-notice">
      <span>Moved to Trash</span>
      <span aria-hidden>·</span>
      <button className="btn" onClick={onUndo} data-testid="trash-undo">
        Undo
      </button>
    </div>
  )
}
