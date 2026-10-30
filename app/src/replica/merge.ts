import {wikilinks, type Block, type Conflict} from '../lib/model.ts'
import {linkRefs} from '../lib/note-docs.ts'
import {NOTE_FIELDS, type NoteDoc, type Ref} from './note.ts'
import {canon, digest, UNSIGNED, writerOf} from './sign.ts'

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

type Part = 'title' | 'notebook' | 'tags'
const part = (n: NoteDoc | Conflict, p: string) => (p.startsWith('body:') ? n.body?.blocks.find((b) => b.id === p.slice(5)) : n[p as Part])
const moved = (from: NoteDoc | Conflict, to: NoteDoc) => (p: string) => !same(part(from, p), part(to, p))
export const heldParts = (c: Conflict) => c.clash.filter((p) => (p.startsWith('body:') ? c.body : c[p as Part]) !== undefined)
const holds = (c: Conflict, n: NoteDoc) => heldParts(c).every((p) => !moved(c, n)(p))
const TYPED = 512
const carried = (p: string) => p === 'title' || p.startsWith('body:')
const marked = (s: string) => `${s.length.toString(36)}.${digest(s)}.${digest(`~${s}`)}`
const mark = (n: NoteDoc | Conflict, p: string) => marked(`${p}\n${canon(part(n, p))}`)
const typedFrom = (c: Conflict, typed: Set<string>) => heldParts(c).every((p) => carried(p) && typed.has(mark(c, p)))
const organized = (n: Pick<NoteDoc, 'tags' | 'notebook'>, clash: string[]) => ({...(clash.includes('tags') && {tags: n.tags ?? []}), ...(clash.includes('notebook') && {notebook: n.notebook ?? null})})
const before = (a: Conflict, b: Conflict) => a.at < b.at || (a.at === b.at && a._key < b._key)
const text = (c: Conflict) => canon(heldParts(c).sort().map((p) => [p, part(c, p)]))

export function collapse(all: Conflict[], main: NoteDoc): Conflict[] {
  const first = new Map<string, Conflict>()
  const texts = new Map(all.map((c) => [c, text(c)]))
  for (const [c, t] of texts) if (!first.has(t) || before(c, first.get(t)!)) first.set(t, c)
  return all.filter((c) => first.get(texts.get(c)!) === c && !holds(c, main))
}

export function mergeNote(base: NoteDoc, mine: NoteDoc, theirs: NoteDoc, at: string, me: string, key = theirs._rev ?? at, who = writerOf(theirs) ?? UNSIGNED): NoteDoc {
  const clash: string[] = []
  const out: NoteDoc = {...mine}
  out.title = pick(base.title, mine.title, theirs.title, () => clash.push('title'))
  out.notebook = pick(base.notebook, mine.notebook, theirs.notebook, () => clash.push('notebook'))
  out.tags = pick(base.tags, mine.tags, theirs.tags, () => clash.push('tags'))
  const body = mergeBlocks(base.body?.blocks ?? [], mine.body?.blocks ?? [], theirs.body?.blocks ?? [])
  if (mine.body || theirs.body) out.body = {...mine.body, blocks: body.blocks}
  if (mine.links || theirs.links || out.body) out.links = linksFor(body.blocks, pick(base.links, mine.links, theirs.links, () => {}))
  clash.push(...body.clash.map((id) => `body:${id}`))
  const conflicts = mergeConflicts(base.conflicts ?? [], mine.conflicts ?? [], theirs.conflicts ?? [])
  const copyKey = `${key}~${digest(canon([...clash].sort()))}`
  if (clash.length && who !== me && !conflicts.some((c) => c._key === copyKey)) conflicts.push({_key: copyKey, by: who, at, title: theirs.title, body: theirs.body, ...organized(theirs, clash), clash})
  const typed = new Set(mine._typed)
  const kept = collapse(conflicts.filter((c) => !typedFrom(c, typed)), out)
  out.conflicts = kept.length || mine.conflicts || theirs.conflicts ? kept : undefined
  return out
}

const partsOf = (n: Partial<NoteDoc>) => [...(['title', 'notebook', 'tags'] as const).filter((p) => p in n), ...(n.body?.blocks ?? []).map((b) => `body:${b.id}`)]

export function mergeLocal(note: NoteDoc, shown: Partial<NoteDoc>, after: Partial<NoteDoc>, at: string, key: string, me: string, server: NoteDoc | null): NoteDoc {
  const base = {...note, ...shown}
  const typed = {...note, ...after}
  const from = partsOf(shown).filter((p) => carried(p) && moved(base, typed)(p)).map((p) => mark(base, p))
  const now = new Set(partsOf(after).map((p) => mark(typed, p)))
  if (from.length) typed._typed = [...new Set([...(note._typed ?? []), ...from])].filter((m) => !now.has(m)).slice(-TYPED)
  const under = [...partsOf(shown), ...partsOf(note)].filter(moved(base, note))
  const other = server && under.every((p) => !moved(server, note)(p)) ? (writerOf(server) ?? UNSIGNED) : me
  return mergeNote(base, typed, note, at, me, key, other === me ? `${me}~tab` : other)
}

const FIELDS = ['title', 'notebook', 'tags', 'links', 'conflicts'] as const
const made = (n: NoteDoc) => new Set((n.conflicts ?? []).map((c) => c._key).filter((k) => k.startsWith('local-')))
const landed = <T>(base: T, sent: T[], theirs: T) => (sent.some((x) => same(x, theirs)) ? theirs : base)

export function baseFor(base: NoteDoc | null, sent: NoteDoc[], theirs: NoteDoc | null): NoteDoc | null {
  if (!theirs || !sent.length) return base
  if (sent.some((x) => sameContent(x, theirs))) return theirs
  if (!base) return base
  const [was, now] = [made(base), made(theirs)]
  const first = (p: string, i: number) => !was.has(p) && now.has(p) && !sent.slice(0, i).some((y) => made(y).has(p))
  const proven = sent.filter((x, i) => (x.by === theirs.by && x.by !== base.by) || [...made(x)].some((p) => first(p, i)))
  const pushes = proven.length ? proven : sent
  const byId = (n: NoteDoc) => new Map((n.body?.blocks ?? []).map((x) => [x.id, x]))
  const [B, T, S, A] = [byId(base), byId(theirs), pushes.map(byId), sent.map(byId)]
  const pick = <V>(b: V, s: V[], t: V, a: V[]) => (a.some((x) => same(x, t)) ? t : proven.length && s.every((x) => same(x, s[0])) ? s[0] : landed(b, s, t))
  const ids = order(base.body?.blocks ?? [], pushes[pushes.length - 1].body?.blocks ?? [], theirs.body?.blocks ?? [])
  const blocks = ids.flatMap((id) => pick(B.get(id), S.map((m) => m.get(id)), T.get(id), A.map((m) => m.get(id))) ?? [])
  const out: NoteDoc = {...base, body: base.body || blocks.length ? {...base.body, blocks} : undefined}
  for (const f of FIELDS) (out as Record<string, unknown>)[f] = pick(base[f], pushes.map((x) => x[f]), theirs[f], sent.map((x) => x[f]))
  return sameContent(out, base) ? base : out
}

export function reconcile(base: NoteDoc | null, mine: NoteDoc | null, theirs: NoteDoc | null, at: string, me: string): NoteDoc | null {
  if (!theirs) return mine && (!base || !sameContent(mine, base)) ? mine : null
  if (!mine) return base && sameContent(theirs, base) ? null : theirs
  return mergeNote(base ?? {_id: theirs._id, _type: 'note'}, mine, theirs, at, me)
}
