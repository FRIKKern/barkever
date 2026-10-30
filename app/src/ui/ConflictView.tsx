import type {ReactNode} from 'react'
import {blockText, UNTITLED, type Block, type Conflict, type Note} from '../lib/model'
import {groups} from '../lib/versions'
import {when} from '../lib/when'
import {deviceId} from '../replica/db'
import {dismissVersion, keepVersion} from '../replica/local'

const yours = (by?: string) => !!by && (by === deviceId() || by === `${deviceId()}~tab`)

type Version = {label: string; title?: string; blocks: Block[]; clash: Set<string>}

function Column({v, testId, children}: {v: Version; testId: string; children?: ReactNode}) {
  const mark = (key: string) => (v.clash.has(key) ? ' clash' : '')
  return (
    <div className="kb-col" data-testid={testId}>
      <div className="kb-label">{v.label}</div>
      <div className={`kb-title${mark('title')}`}>{v.title || UNTITLED}</div>
      {v.blocks.map((b) => (
        <p key={b.id} className={`kb-block${mark(`body:${b.id}`)}`} data-block-id={b.id}>
          {blockText(b)}
        </p>
      ))}
      {children}
    </div>
  )
}

function Copy({c, note, onKeep}: {c: Conflict; note: Note; onKeep: () => void}) {
  const v = {label: `${yours(c.by) ? 'Your version' : 'Other version'} · ${when(c.at)}`, title: c.title, blocks: c.body?.blocks ?? [], clash: new Set(c.clash)}
  const keep = () => {
    onKeep()
    void keepVersion(note.id, c._key, {title: note.title, body: {blocks: note.blocks}})
  }
  return (
    <Column v={v} testId="conflict-other">
      <div className="kb-acts">
        <button className="kb-act" onClick={keep} data-testid="keep-version">
          Keep this
        </button>
        <button className="kb-act" onClick={() => void dismissVersion(note.id, c._key)} data-testid="dismiss-version">
          Dismiss
        </button>
      </div>
    </Column>
  )
}

export function ConflictView({note, onKeep}: {note: Note; onKeep: () => void}) {
  if (!note.conflicts.length) return null
  const lanes = groups(note.conflicts)
  const mine = {label: 'This version', title: note.title, blocks: note.blocks, clash: new Set(note.conflicts.flatMap((c) => c.clash))}
  return (
    <details className="keep-both" data-testid="conflict" aria-label="Kept versions">
      <summary className="kb-head">
        Edited in two places · {lanes.length + 1} versions kept
      </summary>
      <div className="kb-cols">
        <Column v={mine} testId="conflict-mine" />
        {lanes.map(({latest, earlier}) => (
          <div className="kb-lane" key={latest._key} data-testid="conflict-lane">
            <Copy c={latest} note={note} onKeep={onKeep} />
            {earlier.length > 0 && (
              <details className="kb-earlier">
                <summary>{earlier.length} earlier</summary>
                {earlier.map((c) => (
                  <Copy key={c._key} c={c} note={note} onKeep={onKeep} />
                ))}
              </details>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}
