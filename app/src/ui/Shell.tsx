import {useEffect, useMemo, useRef, useState} from 'react'
import {flushSync} from 'react-dom'
import {useQueryClient} from '@tanstack/react-query'
import {rememberRecent} from '../lib/library'
import {UNTITLED} from '../lib/model'
import {useReach} from '../lib/online'
import {scopeName, visibleNotes, type Search} from '../lib/scope'
import {dropBlankDrafts, dropIfBlank, useCapture} from './capture'
import {Editor} from './Editor'
import {useBackStep, useLeave} from './history'
import {useRail} from './local-prefs'
import {NoteList, type ListHandle} from './NoteList'
import {Rail} from './Rail'
import {Sidebar} from './Sidebar'
import {useWorld} from './world'

const RECENT_AFTER_MS = 800
const AWAY = {offline: 'Offline. Changes made now won’t reach Barkpark until you reconnect.', unreachable: 'Can’t reach Barkpark. Changes stay on this device until it answers.'}

const typingIn = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

function capturesKey(e: KeyboardEvent): boolean {
  if (e.key.toLowerCase() !== 'n' || e.altKey || e.repeat) return false
  return e.metaKey || e.ctrlKey ? !e.shiftKey : !typingIn(e.target)
}

export function Shell({s}: {s: Search}) {
  const qc = useQueryClient()
  const w = useWorld()
  const reach = useReach()
  const [rail, toggleRail] = useRail()
  const [drawer, setDrawer] = useState(false)
  const [focusTitle, setFocusTitle] = useState<{id: string}>()
  const list = useRef<ListHandle>(null)
  const capture = useCapture(w, s)
  const back = useBackStep(s)
  const notes = useMemo(() => visibleNotes(w.lib.notes, s, w.shelf), [w.lib.notes, s, w.shelf])
  const note = s.n ? w.links.byId.get(s.n) : undefined
  const newNote = capture && (() => (setDrawer(false), capture()))
  const tab = `${note ? note.title || UNTITLED : scopeName(s, w.shelf)} · Barkever`

  useEffect(() => void (document.title = tab), [tab])

  useEffect(() => void dropBlankDrafts(s.n), [])

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
    list.current?.menu()
  }
  const pick = (id?: string) => {
    if (!drawer) return
    if (!id) return closeDrawer()
    setDrawer(false)
    setFocusTitle({id})
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawer) closeDrawer()
      else if (capturesKey(e) && newNote) (e.preventDefault(), newNote())
      else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typingIn(e.target)) (e.preventDefault(), list.current?.search())
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [newNote, drawer])

  const cls = ['app', note ? 'has-note' : 'no-note', (!note || rail === false) && 'no-rail', note && rail === true && 'rail-forced', drawer && 'drawer'].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <Sidebar w={w} s={s} reach={reach} modal={drawer} onNew={newNote} onPick={pick} />
      {drawer && <div className="scrim" onClick={closeDrawer} />}
      <div className="behind" inert={drawer}>
        {reach !== 'online' && (
          <div className="offline" role="status" data-testid="offline">
            <span className="dot" />
            {AWAY[reach]}
          </div>
        )}
        <NoteList ref={list} w={w} s={s} notes={notes} onMenu={() => setDrawer(true)} onNew={newNote} onOpen={(id) => setFocusTitle({id})} />
        {note ? (
          <>
            <Editor
              key={note.id}
              w={w}
              s={s}
              note={note}
              reach={reach}
              focusTitle={focusTitle?.id === note.id ? focusTitle : undefined}
              onBack={back}
              onEscape={() => list.current?.row(note.id) || back()}
              onRail={toggleRail}
            />
            <Rail w={w} s={s} note={note} onRail={toggleRail} />
          </>
        ) : (
          <main className="editor" aria-label="Note">
            <div className="empty-ed">{s.n ? 'That note is gone.' : 'Pick a note, or press N for a new one.'}</div>
          </main>
        )}
      </div>
    </div>
  )
}
