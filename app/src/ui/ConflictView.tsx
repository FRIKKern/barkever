import type {ReactNode} from 'react'
import {blockText, UNTITLED, type Block, type Conflict, type Note} from '../lib/model'
import {groups} from '../lib/versions'
import {when} from '../lib/when'
import {deviceId} from '../replica/db'
import {writeFailed} from '../lib/saver'
import {dismissVersion, keepVersion} from '../replica/local'
import type {World} from './world'

const yours = (by?: string) => !!by && (by === deviceId() || by === `${deviceId()}~tab`)

type Version = {label: string; title?: string; tags?: string[]; notebook?: string | null; blocks: Block[]; clash: Set<string>}
type NotebookName = (id: string | null | undefined) => string

function Column({v, testId, name, children}: {v: Version; testId: string; name: NotebookName; children?: ReactNode}) {
  const mark = (key: string) => (v.clash.has(key) ? ' clash' : '')
  return (
    <div className="kb-col" data-testid={testId}>
      <div className="kb-label">{v.label}</div>
      <div className={`kb-title${mark('title')}`}>{v.title || UNTITLED}</div>
      {v.clash.has('notebook') && <div className="kb-part clash" data-testid="kb-notebook">{name(v.notebook)}</div>}
      {v.clash.has('tags') && <div className="kb-part clash" data-testid="kb-tags">{v.tags?.length ? v.tags.map((t) => `#${t}`).join(' ') : 'No tags'}</div>}
      {v.blocks.map((b) => (
        <p key={b.id} className={`kb-block${mark(`body:${b.id}`)}`} data-block-id={b.id}>
          {blockText(b)}
        </p>
      ))}
      {children}
    </div>
  )
}

function Copy({c, note, name, onKeep}: {c: Conflict; note: Note; name: NotebookName; onKeep: () => void}) {
  const v = {label: `${yours(c.by) ? 'Your version' : 'Other version'} · ${when(c.at)}`, title: c.title, tags: c.tags, notebook: c.notebook?._ref, blocks: c.body?.blocks ?? [], clash: new Set(c.clash)}
  const keep = () => {
    onKeep()
    void keepVersion(note.id, c._key, {title: note.title, body: {blocks: note.blocks}}).catch(writeFailed(note.id))
  }
  return (
    <Column v={v} testId="conflict-other" name={name}>
      <div className="kb-acts">
        <button className="kb-act" onClick={keep} data-testid="keep-version">
          Keep this
        </button>
        <button className="kb-act" onClick={() => void dismissVersion(note.id, c._key).catch(writeFailed(note.id))} data-testid="dismiss-version">
          Dismiss
        </button>
      </div>
    </Column>
  )
}

export function ConflictView({note, w, onKeep}: {note: Note; w: World; onKeep: () => void}) {
  if (!note.conflicts.length) return null
  const lanes = groups(note.conflicts)
  const name: NotebookName = (id) => (id ? (w.shelf.byId.get(id)?.name ?? 'Unknown notebook') : 'No notebook')
  const mine = {label: 'This version', title: note.title, tags: note.tags, notebook: note.notebook, blocks: note.blocks, clash: new Set(note.conflicts.flatMap((c) => c.clash))}
  return (
    <details className="keep-both" data-testid="conflict" aria-label="Kept versions">
      <summary className="kb-head">
        Edited in two places · {lanes.length + 1} versions kept
      </summary>
      <div className="kb-cols">
        <Column v={mine} testId="conflict-mine" name={name} />
        {lanes.map(({latest, earlier}) => (
          <div className="kb-lane" key={latest._key} data-testid="conflict-lane">
            <Copy c={latest} note={note} name={name} onKeep={onKeep} />
            {earlier.length > 0 && (
              <details className="kb-earlier">
                <summary>{earlier.length} earlier</summary>
                {earlier.map((c) => (
                  <Copy key={c._key} c={c} note={note} name={name} onKeep={onKeep} />
                ))}
              </details>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}
