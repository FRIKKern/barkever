import {useEffect, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {Link, useNavigate} from '@tanstack/react-router'
import {star} from '../lib/library'
import {linkCandidates, linkPreview, linkTitle, type Linker} from '../lib/link-pick'
import type {Note} from '../lib/model'
import type {Reach} from '../lib/online'
import {markDirty, markSaved, savePoint, useSaveStatus} from '../lib/saver'
import {deleteNote, editTitle, savedTitle} from '../replica/local'
import {scopeName, type Search} from '../lib/scope'
import {when} from '../lib/when'
import {afterTyping} from '../lib/typing'
import {bridge} from '../lib/ask'
import {editable} from '../lib/ai-edit'
import {AiBar, AiBody, AiEditButton, AiPrompt} from './AiEdit'
import {useAi} from './local-prefs'
import {useAiEdit} from './use-ai-edit'
import {BodyCanvas, type BodyHandle} from './BodyCanvas'
import {ConflictView} from './ConflictView'
import type {BackStep} from './history'
import {Icon} from './icons'
import {NotebookPick, TagEdit} from './Organize'
import type {World} from './world'

const LABEL = {saved: 'Saved', saving: 'Saving…', offline: 'Offline · saved on this device', unreachable: 'Saved on this device', unchecked: 'Can’t check saves on this device'}

type Props = {w: World; s: Search; note: Note; reach: Reach; focusTitle?: {id: string}; back: BackStep; onEscape: () => void; onRail: () => void}

export function Editor({w, s, note, reach, focusTitle, back, onEscape, onRail}: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [title, setTitle] = useState(note.title)
  const status = useSaveStatus(note.id, reach)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const body = useRef<BodyHandle>(null)
  const keys = useRef(0)
  const lastKey = useRef(0)
  const [aiOn] = useAi()
  const edit = useAiEdit(note, body)
  const [picked, setPicked] = useState<string[]>([])
  const [prompting, setPrompting] = useState(false)

  useEffect(() => {
    if (prompting) return
    const onSelect = () => setPicked(body.current!.selected())
    document.addEventListener('selectionchange', onSelect)
    return () => document.removeEventListener('selectionchange', onSelect)
  }, [prompting])

  useEffect(
    () =>
      afterTyping(
        () => lastKey.current,
        () => {
          const at = keys.current
          void savedTitle(note.id).then((t) => at === keys.current && setTitle(t))
        },
      ),
    [note.gen],
  )

  useEffect(() => {
    if (focusTitle || !note.title) titleRef.current?.focus()
  }, [focusTitle])

  const onTitle = (v: string) => {
    const value = v.replace(/\n/g, ' ')
    const shown = title
    setTitle(value)
    markDirty(note.id, 'title')
    keys.current++
    lastKey.current = Date.now()
    void editTitle(note.id, shown, value).then(() => markSaved(note.id, 'title', savePoint(note.id, 'title')))
  }

  const label = LABEL[status]
  const canEdit = !!bridge() && aiOn
  const ready = !edit.run && !prompting && editable(note.blocks, picked).length > 0
  const run = (instruction: string) => {
    setPrompting(false)
    void edit.start(instruction, picked)
  }
  const remove = () => {
    void deleteNote(note.id).then(() => navigate({to: '/', search: {...s, n: undefined}}))
  }
  const path = w.shelf.path(note.notebook)
  const starred = w.prefs.shortcuts.includes(note.id)
  const ins = w.links.backs(note.id).length
  const outs = w.links.outs(note.id).length
  const named = (id: string | null) => w.shelf.path(id).join(' › ')
  const linker: Linker = {pick: (q) => linkCandidates(w.lib.notes, note.id, q, named), preview: (id) => linkPreview(w.links.byId, id, named), resolve: (id) => linkTitle(w.links.byId, id), title: w.links.title}

  return (
    <main className="editor" aria-label="Note" data-note-id={note.id} onKeyDown={(e) => e.key === 'Escape' && !e.defaultPrevented && (e.preventDefault(), onEscape())}>
      <div className="mhead">
        <Link className="back" to="/" search={back.to} replace onClick={(e) => (e.preventDefault(), back.go())}>
          <Icon name="back" />
          {scopeName(back.to, w.shelf)}
        </Link>
        <span className={`saved ${status}`}>{label}</span>
        {canEdit && <AiEditButton icon ready={ready} onOpen={() => setPrompting(true)} />}
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
          {canEdit && <AiEditButton ready={ready} onOpen={() => setPrompting(true)} />}
          <button className="icon-btn" onClick={() => star(qc, note.id, !starred)} aria-pressed={starred} title={starred ? 'Remove from Shortcuts' : 'Add to Shortcuts'} data-testid="star">
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
      {prompting && <AiPrompt onRun={run} onCancel={() => setPrompting(false)} />}
      {edit.run && <AiBar w={w} s={s} edit={{...edit, run: edit.run}} />}
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
          <ConflictView note={note} onKeep={() => (lastKey.current = 0)} />
          {edit.run && <AiBody s={s} edit={{...edit, run: edit.run}} title={linker.title} />}
          <div hidden={!!edit.run}>
            <BodyCanvas note={note} s={s} handle={body} linker={linker} />
          </div>
        </article>
      </div>
    </main>
  )
}
