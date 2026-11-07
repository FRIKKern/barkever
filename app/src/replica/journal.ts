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

function save(j: Journal) {
  try {
    if (Object.keys(j).length) localStorage.setItem(key(), JSON.stringify(Object.fromEntries(Object.entries(j).map(([id, e]) => [id, readableByLastVersion(e)]))))
    else localStorage.removeItem(key())
  } catch {}
}

export function jot(id: string, {shown, title, base, after}: Jot): number {
  const j = load()
  const was = j[id] ?? {seq: 0}
  const seq = (lastSeq = Math.max(was.seq + 1, Date.now(), lastSeq + 1))
  j[id] = {
    ...was,
    seq,
    ...(title !== undefined && {titles: [...(was.titles ?? []), {seq, tab: THIS_TAB, shown, title}]}),
    ...(base && after && {steps: [...(was.steps ?? []), {seq, tab: THIS_TAB, base, after}]}),
  }
  save(j)
  return seq
}

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
