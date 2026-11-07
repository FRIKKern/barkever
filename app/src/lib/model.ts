export type Inline = {type: string; value?: string; text?: string; docId?: string; target?: string; alias?: string; children?: Inline[]}
export type Item = Inline[] | string | {content?: Inline[]; text?: string; checked?: boolean; children?: Block[]}
export type Block = {id: string; type: string; level?: number; text?: string; content?: Inline[]; items?: Item[]; task?: boolean; ordered?: boolean; start?: number; caption?: string}

export type Conflict = {_key: string; by?: string; at: string; title?: string; body?: {blocks: Block[]}; tags?: string[]; notebook?: {_ref: string; _type?: string} | null; clash: string[]}
export type Note = {id: string; title: string; notebook: string | null; tags: string[]; blocks: Block[]; links: string[]; updatedAt: string; rev: string; conflicts: Conflict[]; gen: number}
export type Notebook = {id: string; name: string; parent: string | null}
export type Library = {notes: Note[]; notebooks: Notebook[]}
export type Prefs = {shortcuts: string[]; recents: string[]}

export const UNTITLED = 'Untitled'

export const contentOf = (x: {content?: Inline[]; text?: string}): Inline[] => (x.content?.length ? x.content : x.text ? [{type: 'text', value: x.text}] : [])

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

export const itemContent = (it: Item): Inline[] => (typeof it === 'string' ? [{type: 'text', value: it}] : Array.isArray(it) ? it : isObject(it) ? contentOf(it) : [])

const LISTS = ['list', 'bulletList', 'bullet_list', 'bulleted-list', 'bulleted_list', 'ordered-list', 'numbered_list']
const NUMBERED = ['ordered-list', 'numbered_list']

const asList = (b: Block): Block => (b.type !== 'list' && LISTS.includes(b.type) && Array.isArray(b.items) ? {...b, type: 'list', ordered: b.ordered === true || NUMBERED.includes(b.type)} : b)

export const itemsOf = (b: Block): Item[] => (Array.isArray(b.items) ? b.items : [])

export function nestedOf(it: Item): Block[] {
  const children = isObject(it) ? it.children : undefined
  return Array.isArray(children) ? children.filter(isObject).map((c) => asList(c as Block)) : []
}

export const nestedLists = (it: Item): Block[] => nestedOf(it).filter((c) => c.type === 'list' && Array.isArray(c.items))

export const listStart = ({start}: Block): number | undefined => (Number.isInteger(start) && start !== 1 ? start : undefined)

export const leafText = (x: Inline): string | undefined => x.value || x.text

export type Title = (id?: string) => string | undefined

export const titleIn =
  (byId: ReadonlyMap<string | undefined, Note>): Title =>
  (id) => {
    const n = byId.get(id)
    return n && (n.title || UNTITLED)
  }

const stored: Title = () => undefined

function inline(c: Inline[], title: Title): string {
  return c.map((x) => (x.type === 'wikilink' ? linkWords(x, title) : leafText(x) || inline(x.children ?? [], title))).join('')
}

export function linkWords(x: Inline, title: Title): string {
  const words = inline(x.children ?? [], title)
  return (x.alias == null && words === x.target && title(x.docId)) || words
}

export const linkMissing = (x: Inline, title: Title): boolean => !title(x.docId)

export const inlineText = (c: Inline[] = []): string => inline(c, stored)

export const itemText = (it: Item, title: Title): string => inline(itemContent(it), title)

function shownText(b: Block, title: Title): string {
  if (b.type === 'list') return itemsOf(b).flatMap((it) => [inline(itemContent(it), title), ...nestedOf(it).map((c) => shownText(c, title))]).filter(Boolean).join(' · ')
  return inline(contentOf(b), title)
}

export const blockText = (b: Block): string => shownText(b, stored)

const inlines = (b: Block): Inline[] => (b.type === 'list' ? itemsOf(b).flatMap((it) => [...itemContent(it), ...nestedOf(it).flatMap(inlines)]) : b.content ?? [])

export function wikilinks(blocks: Block[]): string[] {
  const out = new Set<string>()
  const walk = (c: Inline[]) => c.forEach((x) => (x.type === 'wikilink' && (x.docId || x.target) ? out.add((x.docId || x.target)!) : walk(x.children ?? [])))
  blocks.forEach((b) => walk(inlines(b)))
  return [...out]
}

export function linkContext(blocks: Block[], target: string, title: Title): string {
  const b = blocks.find((b) => wikilinks([b]).includes(target))
  return b ? shownText(b, title) : ''
}

export function snippet(n: Note, title: Title): string {
  const b = n.blocks.find((b) => b.type === 'paragraph' && blockText(b).trim())
  return b ? shownText(b, title) : 'No text yet'
}

export function hitLine(n: Note, words: string[], title: Title): string | undefined {
  const b = n.blocks.find((b) => words.some((w) => blockText(b).toLowerCase().includes(w)))
  return b && shownText(b, title)
}

const EMPTYABLE = new Set(['paragraph', 'heading', 'blockquote', 'text', 'strong', 'em', 'underline', 'strikethrough', 'code', ...LISTS])
const NAMES = new Set(['id', 'type', '_key', '_type'])
const FLAGS = new Set(['level', 'task', 'ordered', 'checked'])

const quiet = ([k, v]: [string, unknown]) => NAMES.has(k) || (FLAGS.has(k) && (typeof v === 'number' || typeof v === 'boolean')) || holdsNothing(v)

const holdsNothing = (x: unknown): boolean =>
  x == null ||
  (typeof x === 'string' && !x.trim()) ||
  (Array.isArray(x) && x.every(holdsNothing)) ||
  (typeof x === 'object' && !Array.isArray(x) && (!('type' in x) || EMPTYABLE.has(String(x.type))) && Object.entries(x).every(quiet))

export const isBlank = (n: Note) => !n.title.trim() && n.blocks.every(holdsNothing)

export const emptyParagraph = (id: string): Block => ({id, type: 'paragraph', content: []})
