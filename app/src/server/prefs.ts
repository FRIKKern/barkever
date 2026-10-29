import '@tanstack/react-start/server-only'
import {BarkparkError, bpJson, dataset} from './barkpark'
import {refusedForGood} from './refused'
import type {Prefs} from '../lib/model'

const KEYS = {shortcuts: 'barkever.shortcuts', recents: 'barkever.recents'} as const
type Kind = keyof typeof KEYS
type Stored = {value: {v?: number; ids?: unknown} | null}
type Op = {op: 'push_front' | 'add' | 'remove'; item: string; max?: number}

const path = (kind: Kind) => `/v1/prefs/${dataset()}/${KEYS[kind]}`
const listed = ({value}: Stored) => (Array.isArray(value?.ids) ? value.ids.filter((x): x is string => typeof x === 'string') : [])
const read = (kind: Kind) => bpJson<Stored>(path(kind)).then(listed)
const patch = (kind: Kind, body: Op) => bpJson<Stored>(path(kind), 'PATCH', {field: 'ids', ...body}).then(listed)

export async function readPrefs(): Promise<Prefs> {
  const [shortcuts, recents] = await Promise.all([read('shortcuts'), read('recents')])
  return {shortcuts, recents}
}

export const RECENT_MAX = 20

export const pushRecent = (id: string) => patch('recents', {op: 'push_front', item: id, max: RECENT_MAX})

export type Starred = {shortcuts: string[]; refused?: number}

export const setShortcut = (id: string, on: boolean): Promise<Starred> =>
  patch('shortcuts', {op: on ? 'add' : 'remove', item: id}).then(
    (shortcuts) => ({shortcuts}),
    async (e) => (e instanceof BarkparkError && refusedForGood(e.status) ? {shortcuts: await read('shortcuts'), refused: e.status} : Promise.reject(e)),
  )
