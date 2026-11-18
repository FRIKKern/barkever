import {snippet, UNTITLED, type Note} from '../lib/model'
import {when} from '../lib/when'
import type {World} from './world'

export function MapCard({w, note}: {w: World; note: Note}) {
  const path = w.shelf.path(note.notebook)
  return (
    <div className="map-card" data-testid="map-card" aria-live="polite">
      <span className="nbline">
        <span className="dot" style={{background: w.shelf.colour(note.notebook)}} />
        {path.length ? path.join(' › ') : 'No notebook'} · {when(note.updatedAt)}
      </span>
      <b>{note.title || UNTITLED}</b>
      <p>{snippet(note, w.links.title)}</p>
      <div className="stat">
        <span>
          <b>{w.links.backs(note.id).length}</b> linked from
        </span>
        <span>
          <b>{w.links.outs(note.id).length}</b> links to
        </span>
      </div>
      <span className="hint">Click or press Enter to open</span>
    </div>
  )
}
