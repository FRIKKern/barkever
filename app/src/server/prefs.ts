import '@tanstack/react-start/server-only'
import {bpJson, dataset} from './barkpark'
import type {Prefs} from '../lib/model'

const KEYS = {shortcuts: 'barkever.shortcuts', recents: 'barkever.recents'} as const
type Kind = keyof typeof KEYS
type Stored = {value: {v?: number; ids?: unknown} | null}

const path = (kind: Kind) => `/v1/prefs/${dataset()}/${KEYS[kind]}`

async function ids(kind: Kind): Promise<string[]> {
  const {value} = await bpJson<Stored>(path(kind))
  return Array.isArray(value?.ids) ? value.ids.filter((x): x is string => typeof x === 'string') : []
}

const write = (kind: Kind, list: string[]) => bpJson(path(kind), 'PUT', {value: {v: 1, ids: list}}).then(() => list)

export async function readPrefs(): Promise<Prefs> {
  const [shortcuts, recents] = await Promise.all([ids('shortcuts'), ids('recents')])
  return {shortcuts, recents}
}

export const RECENT_MAX = 20

export const pushRecent = async (id: string) => write('recents', [id, ...(await ids('recents')).filter((x) => x !== id)].slice(0, RECENT_MAX))

export async function toggleShortcut(id: string) {
  const list = await ids('shortcuts')
  return write('shortcuts', list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
}
