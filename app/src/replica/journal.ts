import type {Block} from '../lib/model'
import {replicaKey} from './db'

export type Step = {seq: number; tab?: string; base: Block[]; after: Block[]}
type TitleStep = {seq: number; tab?: string; shown?: string; title: string}
type Replayed = {seq: number; tab: string; at: number}
export type Jotted = {seq: number; titles?: TitleStep[]; steps?: Step[]; replayed?: Replayed[]}
type Stored = Jotted & {title?: string; titleSeq?: number}
export type Jot = {shown?: string; title?: string; base?: Block[]; after?: Block[]}
type Journal = Record<string, Jotted>

const key = () => `${replicaKey()}-journal`
const THIS_TAB = crypto.randomUUID()
let lastSeq = 0

function upgraded({title, titleSeq, titles = [], ...j}: Stored): Jotted {
  const known = title === undefined || titles.some((t) => t.seq === titleSeq)
  const all = known ? titles : [...titles, {seq: titleSeq ?? j.seq, title}]
  return all.length ? {...j, titles: all} : j
}

function readableByLastVersion(j: Jotted): Stored {
  const last = j.titles?.at(-1)
  return last ? {...j, title: last.title, titleSeq: last.seq} : j
}

function load(): Journal {
  try {
    const stored = JSON.parse(localStorage.getItem(key()) ?? '{}') as Record<string, Stored>
    return Object.fromEntries(Object.entries(stored).map(([id, j]) => [id, upgraded(j)]))
  } catch {
    return {}
  }
}

function save(j: Journal): boolean {
  try {
    if (Object.keys(j).length) localStorage.setItem(key(), JSON.stringify(Object.fromEntries(Object.entries(j).map(([id, e]) => [id, readableByLastVersion(e)]))))
    else localStorage.removeItem(key())
    return true
  } catch {
    return false
  }
}

export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

const failedHere = new Set<number>()

export const failed = (seq: number) => void failedHere.add(seq)

// A step that carries on from this tab's last one, which this tab saw fail, replaces it and keeps its base, so a run of
// failed saves stays one step. A step still in flight may land, so nothing joins it. `joined` names the seq it replaced.
function extend<T extends {seq: number; tab?: string}>(list: T[], carriesOn: (last: T) => boolean, make: (last?: T) => T): {list: T[]; joined?: number} {
  const last = list.at(-1)
  return last && last.tab === THIS_TAB && failedHere.has(last.seq) && carriesOn(last) ? {list: [...list.slice(0, -1), make(last)], joined: last.seq} : {list: [...list, make()]}
}

export function jotJoined(id: string, {shown, title, base, after}: Jot): {seq: number; joined?: number} {
  const j = load()
  const was = j[id] ?? {seq: 0}
  const seq = (lastSeq = Math.max(was.seq + 1, Date.now(), lastSeq + 1))
  const titles = title !== undefined ? extend(was.titles ?? [], (last) => last.title === shown && shown !== undefined, (last) => ({seq, tab: THIS_TAB, shown: last?.shown ?? shown, title})) : undefined
  const steps = base && after ? extend(was.steps ?? [], (last) => same(last.after, base), (last) => ({seq, tab: THIS_TAB, base: last?.base ?? base, after})) : undefined
  j[id] = {...was, seq, ...(titles && {titles: titles.list}), ...(steps && {steps: steps.list})}
  const stored = save(j)
  return {seq, joined: stored ? (titles ?? steps)?.joined : undefined}
}

export const jot = (id: string, patch: Jot): number => jotJoined(id, patch).seq

function put(j: Journal, id: string, {seq, titles = [], steps = [], replayed = []}: Jotted) {
  if (!steps.length && !titles.length && !replayed.length) delete j[id]
  else j[id] = {seq, ...(titles.length && {titles}), ...(steps.length && {steps}), ...(replayed.length && {replayed})}
}

// A step this tab replays for another live tab leaves a mark, so that tab skips the step in its owed retries instead of
// applying it again over what the person did since. A lost mark only means the step applies again, as before marks.
function drop(id: string, seq: number, gone: (tab?: string) => boolean, mark = false) {
  const j = load()
  const was = j[id]
  if (!was) return
  const at = Date.now()
  const dropped = (s: {seq: number; tab?: string}) => s.seq <= seq && gone(s.tab)
  const marks = mark ? [...(was.titles ?? []), ...(was.steps ?? [])].filter((s) => dropped(s) && s.tab && s.tab !== THIS_TAB).map((s) => ({seq: s.seq, tab: s.tab!, at})) : []
  const kept = (was.replayed ?? []).filter((r) => mark || r.tab !== THIS_TAB || r.seq > seq)
  put(j, id, {seq: was.seq, titles: was.titles?.filter((t) => !dropped(t)), steps: was.steps?.filter((s) => !dropped(s)), replayed: [...kept, ...marks]})
  save(j)
}

export const unjot = (id: string, seq: number) => drop(id, seq, (tab) => tab === THIS_TAB)

export const unjotReplayed = (id: string, seq: number, applied: boolean) => drop(id, seq, () => true, applied)

export const replayedHere = (id: string) => new Set((load()[id]?.replayed ?? []).filter((r) => r.tab === THIS_TAB).map((r) => r.seq))

const KEEP_MARKS_MS = 24 * 60 * 60 * 1000

export function forgetOldMarks() {
  const j = load()
  const at = Date.now()
  const old = (r: Replayed) => at - r.at >= KEEP_MARKS_MS
  if (!Object.values(j).some((e) => e.replayed?.some(old))) return
  for (const [id, e] of Object.entries(j)) put(j, id, {...e, replayed: e.replayed?.filter((r) => !old(r))})
  save(j)
}

export function forgetJot(id: string) {
  const j = load()
  delete j[id]
  save(j)
}

export const jotted = (): [string, Jotted][] => Object.entries(load()).filter(([, j]) => j.titles?.length || j.steps?.length)

export function forgetJournal() {
  save({})
}
