import {frozen} from './frozen.ts'
import type {NoteDoc} from '../replica/note.ts'
import type {Pushed, ServerDoc} from '../server/sync.ts'
import type {Frame} from '../sync/stream.ts'

type Patch = {patch?: {id: string; set: Record<string, unknown>; ifRevisionID?: string}}

export function barkpark(first: NoteDoc, onFrame: (f: Frame) => void) {
  let doc = frozen({...first, _rev: 'r0'}) as ServerDoc
  let revs = 0
  const events: Frame[] = []
  const authors = new Map([['r0', 'seed']])
  const keys = new Set<string>()

  const commit = (next: ServerDoc, who: string) => {
    const rev = `r${++revs}`
    const previousRev = doc._rev
    doc = frozen({...next, _rev: rev})
    authors.set(rev, who)
    for (const c of (doc.conflicts ?? []) as {_key: string}[]) keys.add(c._key)
    const f: Frame = frozen({eventId: events.length + 1, mutation: 'update', type: 'note', documentId: doc._id, rev, previousRev, result: doc})
    events.push(f)
    onFrame(f)
    return doc
  }

  return {
    get doc() {
      return doc as unknown as NoteDoc
    },
    events,
    authors,
    keys,
    mutate(mutations: unknown[], who: string): Pushed {
      const ms = JSON.parse(JSON.stringify(mutations)) as Patch[]
      if (ms.some((m) => !m.patch)) return {status: 400, docs: [], error: 'chaos: only patches'}
      if (ms.some((m) => m.patch!.ifRevisionID !== undefined && m.patch!.ifRevisionID !== doc._rev)) return {status: 412, docs: [], error: 'revision mismatch'}
      return {status: 200, docs: ms.map((m) => commit({...doc, ...(m.patch!.set as ServerDoc)}, who))}
    },
    raw: (change: (d: NoteDoc) => NoteDoc) => commit(change(doc as unknown as NoteDoc) as unknown as ServerDoc, 'raw'),
  }
}

export type Server = ReturnType<typeof barkpark>
