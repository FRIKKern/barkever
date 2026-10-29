import {blockText, UNTITLED, type Block, type Note} from '../lib/model'
import {when} from '../lib/when'
import {deviceId} from '../replica/db'

const yours = (by?: string) => !!by && (by === deviceId() || by === `${deviceId()}~tab`)

type Version = {label: string; title?: string; blocks: Block[]; clash: Set<string>}

function Column({v, testId}: {v: Version; testId: string}) {
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
    </div>
  )
}

export function ConflictView({note}: {note: Note}) {
  if (!note.conflicts.length) return null
  const mine = {label: 'This version', title: note.title, blocks: note.blocks, clash: new Set(note.conflicts.flatMap((c) => c.clash))}
  return (
    <section className="keep-both" data-testid="conflict" aria-label="Kept versions">
      <div className="kb-head">Edited in two places. Both versions are kept.</div>
      <div className="kb-cols">
        <Column v={mine} testId="conflict-mine" />
        {note.conflicts.map((c) => (
          <Column key={c._key} v={{label: `${yours(c.by) ? 'Your version' : 'Other version'} · ${when(c.at)}`, title: c.title, blocks: c.body?.blocks ?? [], clash: new Set(c.clash)}} testId="conflict-other" />
        ))}
      </div>
    </section>
  )
}
