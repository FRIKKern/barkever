import {useEffect, useMemo, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {rememberRecent} from '../lib/library'
import {UNTITLED} from '../lib/model'
import {useOnline} from '../lib/online'
import {visibleNotes, type Search} from '../lib/scope'
import {useCapture} from './capture'
import {Editor} from './Editor'
import {useRail} from './local-prefs'
import {NoteList} from './NoteList'
import {Rail} from './Rail'
import {Sidebar} from './Sidebar'
import {useWorld} from './world'

const RECENT_AFTER_MS = 800

const typingIn = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

export function Shell({s}: {s: Search}) {
  const qc = useQueryClient()
  const w = useWorld()
  const online = useOnline()
  const [rail, toggleRail] = useRail()
  const [drawer, setDrawer] = useState(false)
  const search = useRef<HTMLInputElement>(null)
  const capture = useCapture(w, s)
  const notes = useMemo(() => visibleNotes(w.lib.notes, s, w.shelf), [w.lib.notes, s, w.shelf])
  const note = s.n ? w.links.byId.get(s.n) : undefined

  useEffect(() => {
    if (!note) return
    document.title = `${note.title || UNTITLED} · Barkever`
    const t = setTimeout(() => rememberRecent(qc, note.id), RECENT_AFTER_MS)
    return () => clearTimeout(t)
  }, [note?.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typingIn(e.target)) return
      if (e.key === 'n' && capture) (e.preventDefault(), capture())
      if (e.key === '/') (e.preventDefault(), search.current?.focus())
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [capture])

  const cls = ['app', note ? 'has-note' : 'no-note', (!note || rail === false) && 'no-rail', note && rail === true && 'rail-forced', drawer && 'drawer'].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      {!online && (
        <div className="offline" role="status" data-testid="offline">
          <span className="dot" />
          Offline. Changes made now won’t reach Barkpark until you reconnect.
        </div>
      )}
      <Sidebar w={w} s={s} online={online} onNew={capture && (() => (setDrawer(false), capture()))} onPick={() => setDrawer(false)} />
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}
      <NoteList ref={search} w={w} s={s} notes={notes} onMenu={() => setDrawer(true)} onNew={capture} />
      {note ? (
        <>
          <Editor key={note.id} w={w} s={s} note={note} online={online} onRail={toggleRail} />
          <Rail w={w} s={s} note={note} onRail={toggleRail} />
        </>
      ) : (
        <main className="editor" aria-label="Note">
          <div className="empty-ed">{s.n ? 'That note is gone.' : 'Pick a note, or press N for a new one.'}</div>
        </main>
      )}
    </div>
  )
}
