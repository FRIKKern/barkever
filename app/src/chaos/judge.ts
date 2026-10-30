import {show} from './edits.ts'
import type {Truth} from './truth.ts'
import type {NoteDoc} from '../replica/note.ts'

const {sameContent} = await import('../replica/merge.ts')

export type Failure = {kind: 'lost' | 'echo' | 'diverged' | 'stuck' | 'noisy' | 'crash'; step: number; detail: string}

export function unheld(t: Truth, holders: (NoteDoc | undefined)[], step: number): Failure | undefined {
  const lost = t.lost(holders)
  if (lost.length) return {kind: 'lost', step, detail: lost.map((v) => `"${v.text}" (${v.part}, written by ${v.by} at step ${v.step}) is on no device and not on the server`).join('\n  ')}
}

export function unsettled(t: Truth, doc: NoteDoc, devices: [string, NoteDoc | undefined][], solo: boolean, step: number): Failure | undefined {
  const off = devices.filter(([, n]) => !n || !sameContent(n, doc))
  if (off.length) return {kind: 'diverged', step, detail: `server: ${show(doc)}\n  ${off.map(([id, n]) => `${id}: ${show(n)}`).join('\n  ')}`}
  const lost = t.lost([doc])
  if (lost.length) return {kind: 'lost', step, detail: lost.map((v) => `"${v.text}" (${v.part}, by ${v.by} at step ${v.step}) is not on the settled note`).join('\n  ')}
  if (solo && doc.conflicts?.length) return {kind: 'noisy', step, detail: `one writer typing alone made ${doc.conflicts.length} copies: ${show(doc)}`}
}
