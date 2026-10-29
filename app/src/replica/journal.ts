import type {Block} from '../lib/model'
import type {BlockOp} from './ops'
import {replicaKey} from './db'

export type Jotted = {title?: string; ops?: BlockOp[]; after?: Block[]; seq: number}
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

export function jot(id: string, patch: Omit<Jotted, 'seq'>): number {
  const j = load()
  const seq = (j[id]?.seq ?? 0) + 1
  j[id] = {...j[id], ...patch, ...(patch.ops && {ops: [...(j[id]?.ops ?? []), ...patch.ops]}), seq}
  save(j)
  return seq
}

export function unjot(id: string, seq: number) {
  const j = load()
  if (j[id]?.seq !== seq) return
  delete j[id]
  save(j)
}

export const jotted = (): [string, Jotted][] => Object.entries(load())

export function forgetJournal() {
  save({})
}
