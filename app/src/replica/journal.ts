import type {Block} from '../lib/model'
import {replicaKey} from './db'

export type Step = {seq: number; base: Block[]; after: Block[]}
type Jotted = {seq: number; title?: string; titleSeq?: number; steps?: Step[]}
export type Jot = {title?: string; base?: Block[]; after?: Block[]}
type Journal = Record<string, Jotted>

const key = () => `${replicaKey()}-journal`

function load(): Journal {
  try {
    return JSON.parse(localStorage.getItem(key()) ?? '{}') as Journal
  } catch {
    return {}
  }
}

function save(j: Journal) {
  try {
    if (Object.keys(j).length) localStorage.setItem(key(), JSON.stringify(j))
    else localStorage.removeItem(key())
  } catch {}
}

export function jot(id: string, {title, base, after}: Jot): number {
  const j = load()
  const was = j[id] ?? {seq: 0}
  const seq = was.seq + 1
  j[id] = {
    ...was,
    seq,
    ...(title !== undefined && {title, titleSeq: seq}),
    ...(base && after && {steps: [...(was.steps ?? []), {seq, base, after}]}),
  }
  save(j)
  return seq
}

function trim(id: string, keepStep: (seq: number) => boolean, keepTitle: (seq: number) => boolean) {
  const j = load()
  const was = j[id]
  if (!was) return
  const steps = (was.steps ?? []).filter((s) => keepStep(s.seq))
  const titled = was.titleSeq !== undefined && keepTitle(was.titleSeq)
  if (!steps.length && !titled) delete j[id]
  else j[id] = {seq: was.seq, ...(titled && {title: was.title, titleSeq: was.titleSeq}), ...(steps.length && {steps})}
  save(j)
}

const newer = (than: number) => (seq: number) => seq > than

export const unjot = (id: string, seq: number, {title}: Jot) => (title === undefined ? trim(id, newer(seq), () => true) : trim(id, () => true, newer(seq)))

export const unjotAll = (id: string, seq: number) => trim(id, newer(seq), newer(seq))

export const jotted = (): [string, Jotted][] => Object.entries(load())

export function forgetJournal() {
  save({})
}
