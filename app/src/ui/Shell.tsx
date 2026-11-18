import {useEffect, useMemo, useRef, useState} from 'react'
import {flushSync} from 'react-dom'
import {useQueryClient} from '@tanstack/react-query'
import {useNavigate} from '@tanstack/react-router'
import {rememberRecent} from '../lib/library'
import {UNTITLED} from '../lib/model'
import type {Pick} from '../lib/palette'
import {useReach} from '../lib/online'
import {scopeName, visibleNotes, type Search} from '../lib/scope'
import {prepare} from '../lib/search'
import {useCapture} from './capture'
import {dropBlankDrafts, dropIfBlank} from '../replica/drop'
import {restoreNote} from '../replica/local'
import {recorded} from '../lib/saver'
import {Board, type BoardHandle} from './Board'
import {Editor} from './Editor'
import {useBackStep, useLeave, useLeaveView} from './history'
import {useRail} from './local-prefs'
import {NoteList, type ListHandle} from './NoteList'
import {NotesMap} from './NotesMap'
import {Palette, usePalette} from './Palette'
import {Rail} from './Rail'
import {Sidebar} from './Sidebar'
import {TrashedNote, TrashList, TrashNotice, type TrashHandle} from './Trash'
import {useWorld} from './world'

const RECENT_AFTER_MS = 800
const AWAY = {offline: 'Offline. Changes made now won’t reach Barkpark until you reconnect.', unreachable: 'Can’t reach Barkpark. Changes stay on this device until it answers.'}

const typingIn = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

const plainKey = (e: KeyboardEvent, key: string) => e.key === key && !e.metaKey && !e.ctrlKey && !e.altKey && !typingIn(e.target)

function capturesKey(e: KeyboardEvent): boolean {
  if (e.key.toLowerCase() !== 'n' || e.altKey || e.repeat) return false
  return e.metaKey || e.ctrlKey ? !e.shiftKey : !typingIn(e.target)
}

export function Shell({s}: {s: Search}) {
  const qc = useQueryClient()
  const palette = usePalette()
  const w = useWorld()
  const reach = useReach()
  const [rail, toggleRail] = useRail()
  const [drawer, setDrawer] = useState(false)
  const [focusTitle, setFocusTitle] = useState<{id: string}>()
  const list = useRef<ListHandle>(null)
  const boardRef = useRef<BoardHandle>(null)
  const trashRef = useRef<TrashHandle>(null)
  const [moved, setMoved] = useState<string>()
  const capture = useCapture(w, s)
  const back = useBackStep(s)
  const navigate = useNavigate()
  const leaveMap = useLeaveView(s)
  const mapOn = s.view === 'map'
  const found = useMemo(() => visibleNotes(w.lib.notes, s, w.shelf), [w.lib.notes, s.q, s.nb, s.tag, w.shelf])
  const tasks = s.view === 'tasks'
  const trashOn = s.view === 'trash'
  const note = s.n ? w.links.byId.get(s.n) : undefined
  const trashed = s.n && !note ? w.trash.find((n) => n.id === s.n) : undefined
  const open = note ?? trashed
  const newNote = capture && (() => (setDrawer(false), capture()))
  const tab = `${open && !mapOn ? open.title || UNTITLED : scopeName(s, w.shelf)} · Barkever`

  useEffect(() => void (document.title = tab), [tab])

  useEffect(() => void dropBlankDrafts(s.n), [])

  useEffect(() => prepare(w.lib.notes), [w.lib.notes])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => rememberRecent(qc, note.id), RECENT_AFTER_MS)
    return () => clearTimeout(t)
  }, [note?.id])

  useLeave(s.n, (left) => {
    setFocusTitle(undefined)
    void dropIfBlank(left)
  })

  const closeDrawer = () => {
    flushSync(() => setDrawer(false))
    const pane = list.current ?? boardRef.current ?? trashRef.current
    pane?.menu()
  }
  const pick = (id?: string) => {
    if (!drawer) return
    if (!id) return closeDrawer()
    setDrawer(false)
    setFocusTitle({id})
  }

  const choose = (p: Pick) => {
    palette.close(p.act === 'rail')
    setDrawer(false)
    if (p.act === 'new') return newNote?.()
    if (p.act === 'rail') return toggleRail()
    void navigate({to: '/', search: p.to}).then(() => requestAnimationFrame(() => (p.note ? setFocusTitle({id: p.note.id}) : list.current?.row('') || palette.restore())))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawer) closeDrawer()
      else if (capturesKey(e) && newNote) (e.preventDefault(), newNote())
      else if (plainKey(e, '/')) (e.preventDefault(), list.current?.search())
      else if (plainKey(e, 'm') && !e.repeat) (e.preventDefault(), mapOn ? leaveMap() : navigate({to: '/', search: {...s, view: 'map'}}))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [newNote, drawer, mapOn, s])

  const shown = palette.open && <Palette w={w} s={s} canNew={!!newNote} onPick={choose} onClose={() => palette.close(true)} />

  if (mapOn)
    return (
      <>
        <NotesMap w={w} from={s.n} onLeave={leaveMap} />
        {shown}
      </>
    )

  const undo = (id: string) => {
    setMoved(undefined)
    void recorded(id, restoreNote(id).then(() => true)).then((done) => {
      if (done) void navigate({to: '/', search: {...s, view: undefined, n: id}})
    })
  }

  const cls = ['app', open ? 'has-note' : 'no-note', (!note || rail === false) && 'no-rail', note && rail === true && 'rail-forced', drawer && 'drawer'].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <Sidebar w={w} s={s} reach={reach} modal={drawer} onNew={newNote} onPick={pick} />
      {drawer && <div className="scrim" onClick={closeDrawer} />}
      {shown}
      <div className="behind" inert={drawer}>
        {reach !== 'online' && (
          <div className="offline" role="status" data-testid="offline">
            <span className="dot" />
            {AWAY[reach]}
          </div>
        )}
        {tasks ? (
          <Board ref={boardRef} w={w} onMenu={() => setDrawer(true)} />
        ) : (
          <>
            {trashOn ? <TrashList ref={trashRef} w={w} s={s} onMenu={() => setDrawer(true)} /> : <NoteList ref={list} w={w} s={s} found={found} onMenu={() => setDrawer(true)} onNew={newNote} onOpen={(id) => setFocusTitle({id})} />}
            {note ? (
              <>
                <Editor
                  key={note.id}
                  w={w}
                  s={s}
                  note={note}
                  reach={reach}
                  focusTitle={focusTitle?.id === note.id ? focusTitle : undefined}
                  back={back}
                  onEscape={() => list.current?.row(note.id) || back.go()}
                  onRail={toggleRail}
                  onTrashed={setMoved}
                />
                <Rail w={w} s={s} note={note} onRail={toggleRail} />
              </>
            ) : trashed ? (
              <TrashedNote w={w} s={s} note={trashed} back={back} />
            ) : (
              <main className="editor" aria-label="Note">
                <div className="empty-ed">{s.n ? 'That note is gone.' : 'Pick a note, or press N for a new one.'}</div>
              </main>
            )}
          </>
        )}
      </div>
      {moved && <TrashNotice id={moved} onUndo={() => undo(moved)} onDone={() => setMoved(undefined)} />}
    </div>
  )
}
