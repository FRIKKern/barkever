import type {Note} from './model.ts'
import type {Shelf} from './notebooks.ts'
import type {Search} from './scope.ts'
import {find, terms} from './search.ts'

export type Kind = 'command' | 'notebook' | 'tag' | 'note'
export type Act = 'new' | 'today' | 'rail'
export type Pick = {key: string; kind: Kind; label: string; score: number; to?: Search; act?: Act; detail?: string; note?: Note}
export type Ask = {q: string; here: Search; notes: Note[]; shelf: Shelf; tags: [string, number][]; recents: string[]; canNew: boolean}

const EXACT = 12
const PREFIX = 10
const WORDS = 6
const BODY = 3
const LAST = 1
const NOTES_SHOWN = 8
const PLACES_SHOWN = 5
const RECENTS_SHOWN = 5
const KIND_ORDER: Record<Kind, number> = {command: 0, notebook: 1, tag: 2, note: 3}
const WORD = /[\p{L}\p{N}]+/gu

type Command = {key: string; label: string; words: string; to?: Search; act?: Act}
const COMMANDS: Command[] = [
  {key: 'new', label: 'New note', words: 'create capture write', act: 'new'},
  {key: 'today', label: 'Today’s note', words: 'daily journal date day', act: 'today'},
  {key: 'tasks', label: 'Tasks board', words: 'todo checklist plan', to: {view: 'tasks'}},
  {key: 'map', label: 'Open the map', words: 'graph overview links visual'},
  {key: 'all', label: 'Go to all notes', words: 'home everything library', to: {}},
  {key: 'rail', label: 'Toggle rail', words: 'links backlinks graph side panel', act: 'rail'},
]

function fit(label: string, words: string, q: string, ts: string[]): number {
  const l = label.toLowerCase()
  if (l === q) return EXACT
  if (l.startsWith(q)) return PREFIX
  const ws = `${l} ${words}`.match(WORD) ?? []
  return ts.every((t) => ws.some((w) => w.startsWith(t))) ? WORDS : 0
}

function tier(n: Note, q: string, ts: string[]): number {
  const t = n.title.toLowerCase()
  if (t === q) return EXACT
  if (t.startsWith(q)) return PREFIX
  return ts.every((x) => t.includes(x)) ? WORDS : BODY
}

const noteTo = ({nb, tag}: Search, n: string): Search => ({...(nb ? {nb} : tag ? {tag} : {}), n})

const notePick = (n: Note, here: Search, score: number): Pick => ({key: `note:${n.id}`, kind: 'note', label: n.title, score, to: noteTo(here, n.id), note: n})

function commands(a: Ask): Command[] {
  return COMMANDS.filter((c) => (c.act === 'new' || c.act === 'today' ? a.canNew : c.key === 'rail' ? !!a.here.n : true)).map((c) => (c.key === 'map' ? {...c, to: {...a.here, view: 'map'}} : c))
}

const commandPick = (c: Command, score: number): Pick => ({key: c.key, kind: 'command', label: c.label, score, ...(c.to ? {to: c.to} : {}), ...(c.act ? {act: c.act} : {})})

function opening(a: Ask): Pick[] {
  const byId = new Map(a.notes.map((n) => [n.id, n]))
  const recent = a.recents.flatMap((id) => byId.get(id) ?? []).slice(0, RECENTS_SHOWN)
  return [...recent.map((n) => notePick(n, a.here, 0)), ...commands(a).map((c) => commandPick(c, 0))]
}

function notebooks(a: Ask, q: string, ts: string[]): Pick[] {
  return [...a.shelf.byId.values()].flatMap((nb) => {
    const score = fit(nb.name, '', q, ts)
    const parents = a.shelf.path(nb.id).slice(0, -1)
    return score ? [{key: `notebook:${nb.id}`, kind: 'notebook' as const, label: nb.name, score, to: {nb: nb.id}, ...(parents.length ? {detail: parents.join(' / ')} : {})}] : []
  })
}

function tags(a: Ask, q: string, ts: string[]): Pick[] {
  return a.tags.flatMap(([t]) => {
    const score = fit(t, '', q, ts)
    return score ? [{key: `tag:${t}`, kind: 'tag' as const, label: `#${t}`, score, to: {tag: t}}] : []
  })
}

const best = (picks: Pick[], count: number) => picks.sort((x, y) => y.score - x.score).slice(0, count)

export function rank(a: Ask): {picks: Pick[]; marks: string[]} {
  const ts = terms(a.q)
  if (!ts.length) return {picks: opening(a), marks: []}
  const q = ts.join(' ')
  const found = find(a.notes, a.q)
  const notes = best(found.notes.map((n) => notePick(n, a.here, tier(n, q, ts))), NOTES_SHOWN)
  const cmds = commands(a).flatMap((c) => {
    const score = fit(c.label, c.words, q, ts)
    return score ? [commandPick(c, score)] : []
  })
  const picks = [...cmds, ...best(notebooks(a, q, ts), PLACES_SHOWN), ...best(tags(a, q, ts), PLACES_SHOWN), ...notes]
  picks.sort((x, y) => y.score - x.score || KIND_ORDER[x.kind] - KIND_ORDER[y.kind])
  const typed = a.q.trim()
  return {picks: [...picks, {key: 'search', kind: 'command', label: `Search all notes for “${typed}”`, score: LAST, to: {q: typed}}], marks: found.marks}
}
