import {useState, type KeyboardEvent} from 'react'
import {Link} from '@tanstack/react-router'
import type {Note} from '../lib/model'
import {moveNote, retag} from '../replica/local'
import type {World} from './world'

export const cleanTag = (t: string) => t.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-')

export function NotebookPick({w, note}: {w: World; note: Note}) {
  const {shelf} = w
  const options = shelf.roots.flatMap((nb) => [nb, ...shelf.children(nb.id)])
  return (
    <label className="nbchip pick" title="Move to notebook">
      <span className="dot" style={{background: shelf.colour(note.notebook)}} />
      <select value={note.notebook ?? ''} onChange={(e) => void moveNote(note.id, note.notebook, e.target.value)} aria-label="Notebook" data-testid="notebook-pick">
        {!note.notebook && <option value="">No notebook</option>}
        {options.map((nb) => (
          <option key={nb.id} value={nb.id}>
            {shelf.path(nb.id).join(' › ')}
          </option>
        ))}
      </select>
    </label>
  )
}

export function TagEdit({w, note}: {w: World; note: Note}) {
  const [draft, setDraft] = useState('')
  const known = w.tags.map(([t]) => t).filter((t) => !note.tags.includes(t))
  const set = (tags: string[]) => void retag(note.id, note.tags, tags)
  const add = () => {
    const t = cleanTag(draft)
    setDraft('')
    if (t && !note.tags.includes(t)) set([...note.tags, t])
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') (e.preventDefault(), add())
    else if (e.key === 'Backspace' && !draft && note.tags.length) set(note.tags.slice(0, -1))
  }
  return (
    <>
      {note.tags.map((t) => (
        <span key={t} className="tag chip" data-testid="note-tag">
          <Link to="/" search={{tag: t, n: note.id}}>#{t}</Link>
          <button onClick={() => set(note.tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} data-testid="untag">
            ×
          </button>
        </span>
      ))}
      <input
        className="tag-add"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
        placeholder="+ tag"
        list={`tags-${note.id}`}
        aria-label="Add tag"
        spellCheck={false}
        data-testid="tag-add"
      />
      <datalist id={`tags-${note.id}`}>
        {known.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  )
}
