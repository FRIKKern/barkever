import {inlineText, itemContent, itemText, nestedOf, UNTITLED, type Block, type Item, type Note, type Title} from './model.ts'
import type {Shelf} from './notebooks.ts'
import {newest} from './search.ts'

export type Task = {line: string; text: string; done: boolean; depth: number}
export type Card = {note: string; title: string; block: string; tasks: Task[]}
export type Column = {notebook: string | null; name: string; cards: Card[]; open: number; done: number}
export type Board = {columns: Column[]; open: number; done: number; lists: number}

export const summary = (b: Board) => (b.lists ? `${b.open} open · ${b.done} done · from ${b.lists} checklist${b.lists === 1 ? '' : 's'}` : 'No checklists yet. Start a line in a note with [ ] and a space.')

export type Spot = {block: string; item: number}

export function textSum(it: Item): string {
  let h = 0x811c9dc5
  for (const c of inlineText(itemContent(it))) h = Math.imul(h ^ c.codePointAt(0)!, 0x01000193)
  return (h >>> 0).toString(36)
}

export const lineKey = (block: string, item: number, it: Item) => `${block}:${item}:${textSum(it)}`

export function lineOf(line?: string): (Spot & {sum: string}) | undefined {
  const m = line?.match(/^(.+):(\d{1,6}):([0-9a-z]{1,7})$/)
  return m ? {block: m[1], item: Number(m[2]), sum: m[3]} : undefined
}

const isChecklist = (b: Block) => b.type === 'list' && b.task === true

export function findLine(blocks: Block[], line?: string): Spot | 'gone' | undefined {
  const at = lineOf(line)
  if (!at) return
  const lists = blocks.filter(isChecklist)
  const hits = (b: Block) => (b.items ?? []).flatMap((it, i) => (textSum(it) === at.sum ? [i] : []))
  const own = lists.find((b) => b.id === at.block)
  const near = own && hits(own).sort((x, y) => Math.abs(x - at.item) - Math.abs(y - at.item))[0]
  if (near !== undefined) return {block: at.block, item: near}
  const moved = lists.find((b) => hits(b).length)
  return moved ? {block: moved.id, item: hits(moved)[0]} : 'gone'
}

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
    .map((b) => ({note: n.id, title: n.title || UNTITLED, block: b.id, tasks: tasksIn(b.items ?? [], (i) => lineKey(b.id, i, b.items![i]), 0, title)}))
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
