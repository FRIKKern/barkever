import {wikilinks, type Block, type Conflict} from '../lib/model.ts'
import {linkRefs} from '../lib/note-docs.ts'
import {NOTE_FIELDS, type NoteDoc, type Ref} from './note.ts'

const empty = (x: unknown) => x == null || x === ''

export function same(a: unknown, b: unknown): boolean {
  if (a === b || (empty(a) && empty(b))) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]))
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  const keys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => !empty(o[k]))
  const kx = keys(x)
  return kx.length === keys(y).length && kx.every((k) => same(x[k], y[k]))
}

export const sameContent = (a: NoteDoc, b: NoteDoc) => NOTE_FIELDS.every((f) => same(a[f], b[f]))

function pick<T>(base: T, mine: T, theirs: T, clash: () => void): T {
  if (same(mine, base)) return theirs
  if (!same(theirs, base) && !same(mine, theirs)) clash()
  return mine
}

function order(base: Block[], mine: Block[], theirs: Block[]): string[] {
  const ids = (xs: Block[]) => xs.map((x) => x.id)
  const inBase = new Set(ids(base))
  const kept = ids(mine).filter((id) => inBase.has(id))
  const keptSet = new Set(kept)
  const mineMoved = !same(kept, ids(base).filter((id) => keptSet.has(id)))
  const [spine, other] = mineMoved ? [ids(mine), ids(theirs)] : [ids(theirs), ids(mine)]
  const out = [...spine]
  let prev: string | undefined
  for (const id of other) {
    if (!out.includes(id)) out.splice(prev === undefined ? 0 : out.indexOf(prev) + 1, 0, id)
    prev = id
  }
  return out
}

export function mergeBlocks(base: Block[], mine: Block[], theirs: Block[]): {blocks: Block[]; clash: string[]} {
  const byId = (xs: Block[]) => new Map(xs.map((x) => [x.id, x]))
  const [B, M, T] = [byId(base), byId(mine), byId(theirs)]
  const clash: string[] = []
  const decide = (id: string): Block | undefined => {
    const [b, m, t] = [B.get(id), M.get(id), T.get(id)]
    if (m && t) return pick(b, m, t, () => clash.push(id))
    const only = m ?? t
    if (!b || !only) return only
    if (same(only, b)) return undefined
    clash.push(id)
    return only
  }
  return {blocks: order(base, mine, theirs).map(decide).filter((b): b is Block => !!b), clash}
}

function mergeConflicts(base: Conflict[], mine: Conflict[], theirs: Conflict[]): Conflict[] {
  const keys = (xs: Conflict[]) => new Set(xs.map((c) => c._key))
  const [B, M, T] = [keys(base), keys(mine), keys(theirs)]
  const keep = (c: Conflict) => !B.has(c._key) || (M.has(c._key) && T.has(c._key))
  return [...mine.filter(keep), ...theirs.filter((c) => !M.has(c._key) && keep(c))]
}

export function linksFor(blocks: Block[], had: Ref[] = []): Ref[] {
  const ids = wikilinks(blocks)
  const old = had.map((l) => l._ref)
  return ids.length === old.length && ids.every((id) => old.includes(id)) ? had : linkRefs(ids)
}

const stillNeeded = (base: NoteDoc, theirs: NoteDoc) => {
  const settled = new Set([...(base.conflicts ?? []), ...(theirs.conflicts ?? [])].map((c) => c._key))
  return (c: Conflict) => c._key !== base._rev || settled.has(c._key)
}

export function mergeNote(base: NoteDoc, mine: NoteDoc, theirs: NoteDoc, at: string, key = theirs._rev ?? at): NoteDoc {
  const clash: string[] = []
  const out: NoteDoc = {...mine}
  out.title = pick(base.title, mine.title, theirs.title, () => clash.push('title'))
  out.notebook = pick(base.notebook, mine.notebook, theirs.notebook, () => clash.push('notebook'))
  out.tags = pick(base.tags, mine.tags, theirs.tags, () => clash.push('tags'))
  const body = mergeBlocks(base.body?.blocks ?? [], mine.body?.blocks ?? [], theirs.body?.blocks ?? [])
  if (mine.body || theirs.body) out.body = {...mine.body, blocks: body.blocks}
  if (mine.links || theirs.links || out.body) out.links = linksFor(body.blocks, pick(base.links, mine.links, theirs.links, () => {}))
  clash.push(...body.clash.map((id) => `body:${id}`))
  let conflicts = mergeConflicts(base.conflicts ?? [], mine.conflicts ?? [], theirs.conflicts ?? [])
  if (clash.length) conflicts = conflicts.filter(stillNeeded(base, theirs))
  if (clash.length && !conflicts.some((c) => c._key === key)) conflicts.push({_key: key, at, title: theirs.title, body: theirs.body, clash})
  out.conflicts = conflicts.length || mine.conflicts || theirs.conflicts ? conflicts : undefined
  return out
}

export function mergeCanvas(note: NoteDoc, base: Block[], after: Block[], at: string, key: string): NoteDoc {
  const shown = (blocks: Block[]) => ({...note, body: {...note.body, blocks}})
  return mergeNote(shown(base), shown(after), note, at, key)
}

export const baseFor = (base: NoteDoc | null, pushed: NoteDoc | undefined, theirs: NoteDoc | null) => (pushed && theirs && sameContent(pushed, theirs) ? theirs : base)

export function reconcile(base: NoteDoc | null, mine: NoteDoc | null, theirs: NoteDoc | null, at: string): NoteDoc | null {
  if (!theirs) return mine && (!base || !sameContent(mine, base)) ? mine : null
  if (!mine) return base && sameContent(theirs, base) ? null : theirs
  return mergeNote(base ?? {_id: theirs._id, _type: 'note'}, mine, theirs, at)
}
