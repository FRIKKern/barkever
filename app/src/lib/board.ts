import {itemText, nestedOf, UNTITLED, type Block, type Item, type Note, type Title} from './model.ts'
import type {Shelf} from './notebooks.ts'
import {newest} from './search.ts'

export type Task = {line: string; text: string; done: boolean; depth: number}
export type Card = {note: string; title: string; block: string; tasks: Task[]}
export type Column = {notebook: string | null; name: string; cards: Card[]; open: number; done: number}
export type Board = {columns: Column[]; open: number; done: number; lists: number}

export const lineKey = (block: string, item: number) => `${block}:${item}`

export function lineOf(line?: string): {block: string; item: number} | undefined {
  const at = line?.lastIndexOf(':') ?? -1
  const item = line?.slice(at + 1) ?? ''
  if (at < 1 || !/^\d{1,6}$/.test(item)) return
  return {block: line!.slice(0, at), item: Number(item)}
}

const isChecklist = (b: Block) => b.type === 'list' && b.task === true

const done = (it: Item) => typeof it === 'object' && !Array.isArray(it) && it.checked === true

function tasksIn(items: Item[], line: (i: number) => string, depth: number, title: Title): Task[] {
  return items.flatMap((it, i) => {
    const text = itemText(it, title).trim()
    const own = text ? [{line: line(i), text, done: done(it), depth}] : []
    const nested = nestedOf(it).filter(isChecklist).flatMap((b) => tasksIn(b.items ?? [], () => line(i), depth + 1, title))
    return [...own, ...nested]
  })
}

function cardsOf(n: Note, title: Title): Card[] {
  return n.blocks
    .filter(isChecklist)
    .map((b) => ({note: n.id, title: n.title || UNTITLED, block: b.id, tasks: tasksIn(b.items ?? [], (i) => lineKey(b.id, i), 0, title)}))
    .filter((c) => c.tasks.length)
}

const count = (cards: Card[], state: boolean) => cards.reduce((sum, c) => sum + c.tasks.filter((t) => t.done === state).length, 0)

export function board(notes: Note[], shelf: Shelf, title: Title): Board {
  const rank = new Map(shelf.roots.flatMap((nb) => [nb, ...shelf.children(nb.id)]).map((nb, i) => [nb.id, i]))
  const byNotebook = new Map<string | null, Card[]>()
  const planned = notes.map((n) => ({n, cards: cardsOf(n, title)})).filter((x) => x.cards.length)
  for (const {n, cards} of planned.sort((a, b) => newest(a.n, b.n))) {
    const home = n.notebook && shelf.byId.has(n.notebook) ? n.notebook : null
    byNotebook.set(home, [...(byNotebook.get(home) ?? []), ...cards])
  }
  const at = (id: string | null) => (id === null ? rank.size + 1 : rank.get(id) ?? rank.size)
  const columns = [...byNotebook]
    .sort(([a], [b]) => at(a) - at(b))
    .map(([notebook, cards]) => ({notebook, name: notebook ? shelf.byId.get(notebook)!.name : 'No notebook', cards, open: count(cards, false), done: count(cards, true)}))
  return {columns, open: columns.reduce((s, c) => s + c.open, 0), done: columns.reduce((s, c) => s + c.done, 0), lists: columns.reduce((s, c) => s + c.cards.length, 0)}
}
