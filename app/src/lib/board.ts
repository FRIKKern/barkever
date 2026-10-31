import {inlineText, itemContent, itemText, nestedOf, UNTITLED, type Block, type Item, type Note, type Title} from './model.ts'
import type {Shelf} from './notebooks.ts'
import {newest} from './search.ts'

export type Task = {line: string; box: string; text: string; done: boolean; depth: number}
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

export const lineKey = (block: string, item: number, it: Item, nth: number) => `${block}:${item}:${textSum(it)}:${nth}`

type Line = Spot & {sum: string; nth: number}

export function lineOf(line?: string): Line | undefined {
  const m = line?.match(/^(.+):(\d{1,6}):([0-9a-z]{1,7}):(\d{1,6})$/)
  return m ? {block: m[1], item: Number(m[2]), sum: m[3], nth: Number(m[4])} : undefined
}

const isChecklist = (b: Block) => b.type === 'list' && b.task === true

export function findLine(blocks: Block[], line?: string): Spot | 'gone' | undefined {
  const at = lineOf(line)
  if (!at) return
  const lists = blocks.filter(isChecklist)
  const own = lists.find((b) => b.id === at.block)
  const near = own && itemIn(own, at)
  if (near !== undefined) return {block: at.block, item: near}
  const moved = lists.find((b) => hits(b, at).length)
  return moved ? {block: moved.id, item: hits(moved, at)[0]} : 'gone'
}

const hits = (b: Block, at: Line) => (b.items ?? []).flatMap((it, i) => (textSum(it) === at.sum ? [i] : []))

function itemIn(b: Block, at: Line): number | undefined {
  const twins = hits(b, at)
  return at.nth < twins.length ? twins[at.nth] : twins.sort((x, y) => Math.abs(x - at.item) - Math.abs(y - at.item))[0]
}

const done = (it: Item) => typeof it === 'object' && !Array.isArray(it) && it.checked === true

function tasksIn(list: Block, line: (i: number) => string, depth: number, title: Title): Task[] {
  const boxes = keysOf(list.id, list.items ?? [])
  return (list.items ?? []).flatMap((it, i) => {
    const text = itemText(it, title).trim()
    const own = text ? [{line: line(i), box: boxes[i], text, done: done(it), depth}] : []
    const nested = nestedOf(it).filter(isChecklist).flatMap((b) => tasksIn(b, () => line(i), depth + 1, title))
    return [...own, ...nested]
  })
}

const flip = (it: Item): Item => (typeof it === 'object' && !Array.isArray(it) ? {...it, checked: !done(it)} : {content: itemContent(it), checked: true})

const tickUnder = (it: Item, at: Line): Item => (typeof it === 'object' && !Array.isArray(it) && it.children ? {...it, children: tickAll(it.children, at)} : it)

function tickAll(blocks: Block[], at: Line): Block[] {
  return blocks.map((b) => {
    if (!b.items) return b
    const hit = b.id === at.block ? itemIn(b, at) : undefined
    return {...b, items: b.items.map((it, i) => tickUnder(i === hit ? flip(it) : it, at))}
  })
}

export function ticked(blocks: Block[], box: string): Block[] {
  const at = lineOf(box)
  return at ? tickAll(blocks, at) : blocks
}

function keysOf(block: string, items: Item[]): string[] {
  const sums = items.map(textSum)
  return items.map((it, i) => lineKey(block, i, it, sums.slice(0, i).filter((s) => s === sums[i]).length))
}

function cardsOf(n: Note, title: Title): Card[] {
  return n.blocks
    .filter(isChecklist)
    .map((b) => {
      const keys = keysOf(b.id, b.items ?? [])
      return {note: n.id, title: n.title || UNTITLED, block: b.id, tasks: tasksIn(b, (i) => keys[i], 0, title)}
    })
    .filter((c) => c.tasks.length)
}

type Planned = {cards: Card[]; titles: [string | undefined, string | undefined][]}
const planned = new WeakMap<Note, Planned>()

function plan(n: Note, title: Title): Card[] {
  const hit = planned.get(n)
  if (hit && hit.titles.every(([id, t]) => title(id) === t)) return hit.cards
  const titles: Planned['titles'] = []
  const cards = cardsOf(n, (id) => {
    const t = title(id)
    titles.push([id, t])
    return t
  })
  planned.set(n, {cards, titles})
  return cards
}

const count = (cards: Card[], state: boolean) => cards.reduce((sum, c) => sum + c.tasks.filter((t) => t.done === state).length, 0)

export function board(notes: Note[], shelf: Shelf, title: Title): Board {
  const rank = new Map(shelf.roots.flatMap((nb) => [nb, ...shelf.children(nb.id)]).map((nb, i) => [nb.id, i]))
  const byNotebook = new Map<string | null, Card[]>()
  const withCards = notes.map((n) => ({n, cards: plan(n, title)})).filter((x) => x.cards.length)
  for (const {n, cards} of withCards.sort((a, b) => newest(a.n, b.n))) {
    const home = n.notebook && shelf.byId.has(n.notebook) ? n.notebook : null
    const column = byNotebook.get(home)
    if (column) column.push(...cards)
    else byNotebook.set(home, [...cards])
  }
  const at = (id: string | null) => (id === null ? rank.size + 1 : rank.get(id) ?? rank.size)
  const columns = [...byNotebook]
    .sort(([a], [b]) => at(a) - at(b))
    .map(([notebook, cards]) => ({notebook, name: notebook ? shelf.byId.get(notebook)!.name : 'No notebook', cards, open: count(cards, false), done: count(cards, true)}))
  return {columns, open: columns.reduce((s, c) => s + c.open, 0), done: columns.reduce((s, c) => s + c.done, 0), lists: columns.reduce((s, c) => s + c.cards.length, 0)}
}
