import type {Block} from '../lib/model'
import {replicaKey} from './db'

export type Step = {seq: number; tab?: string; base: Block[]; after: Block[]}
type TitleStep = {seq: number; tab?: string; shown?: string; title: string}
export type Jotted = {seq: number; titles?: TitleStep[]; steps?: Step[]}
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

function drop(id: string, seq: number, gone: (tab?: string) => boolean) {
  const j = load()
  const was = j[id]
  if (!was) return
  const steps = (was.steps ?? []).filter((s) => s.seq > seq || !gone(s.tab))
  const titles = (was.titles ?? []).filter((t) => t.seq > seq || !gone(t.tab))
  if (!steps.length && !titles.length) delete j[id]
  else j[id] = {seq: was.seq, ...(titles.length && {titles}), ...(steps.length && {steps})}
  save(j)
}

export const unjot = (id: string, seq: number) => drop(id, seq, (tab) => tab === THIS_TAB)

export const unjotReplayed = (id: string, seq: number) => drop(id, seq, () => true)

export function forgetJot(id: string) {
  const j = load()
  delete j[id]
  save(j)
}

export const jotted = (): [string, Jotted][] => Object.entries(load())

export function forgetJournal() {
  save({})
}
