import {holdsNothing, type Note} from './model.ts'
import type {Shelf} from './notebooks.ts'

export type Day = {id: string; title: string; notebook: string; blockId: string}
type Where = {locale?: string; timeZone?: string}

const DAY_ID = /^note-day-(\d{4}-\d{2}-\d{2})$/

export function dayKey(at: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(at)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export const dayTitle = (key: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, {timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'}).format(new Date(`${key}T12:00:00Z`))

export const dayId = (key: string) => `note-day-${key}`

const named = (shelf: Shelf, name: string) => [...shelf.byId.values()].find((nb) => nb.name.trim().toLowerCase() === name)?.id

export function today(at: Date, shelf: Shelf, {locale, timeZone}: Where = {}): Day | null {
  const notebook = named(shelf, 'daily') ?? named(shelf, 'inbox') ?? shelf.roots[0]?.id
  if (!notebook) return null
  const key = dayKey(at, timeZone)
  const id = dayId(key)
  return {id, title: dayTitle(key, locale), notebook, blockId: `${id}-p0`}
}

export function untouchedDay(n: Note, locale?: string): boolean {
  const key = DAY_ID.exec(n.id)?.[1]
  return !!key && n.title === dayTitle(key, locale) && n.blocks.every(holdsNothing)
}
