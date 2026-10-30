export type Inline = {type: string; value?: string; text?: string; docId?: string; target?: string; alias?: string; children?: Inline[]}
export type Item = Inline[] | string | {content?: Inline[]; text?: string; checked?: boolean; children?: Block[]}
export type Block = {id: string; type: string; level?: number; text?: string; content?: Inline[]; items?: Item[]; task?: boolean; ordered?: boolean; caption?: string}

export type Conflict = {_key: string; by?: string; at: string; title?: string; body?: {blocks: Block[]}; tags?: string[]; notebook?: {_ref: string; _type?: string} | null; clash: string[]}
export type Note = {id: string; title: string; notebook: string | null; tags: string[]; blocks: Block[]; links: string[]; updatedAt: string; rev: string; conflicts: Conflict[]; gen: number}
export type Notebook = {id: string; name: string; parent: string | null}
export type Library = {notes: Note[]; notebooks: Notebook[]}
export type Prefs = {shortcuts: string[]; recents: string[]}

export const UNTITLED = 'Untitled'

export const contentOf = (x: {content?: Inline[]; text?: string}): Inline[] => (x.content?.length ? x.content : x.text ? [{type: 'text', value: x.text}] : [])

export const itemContent = (it: Item): Inline[] => (typeof it === 'string' ? [{type: 'text', value: it}] : Array.isArray(it) ? it : contentOf(it))

export const nestedOf = (it: Item): Block[] => (it as {children?: Block[]}).children ?? []

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

export function shownText(b: Block, title: Title): string {
  if (b.type === 'list') return (b.items ?? []).flatMap((it) => [inline(itemContent(it), title), ...nestedOf(it).map((c) => shownText(c, title))]).filter(Boolean).join(' · ')
  return inline(contentOf(b), title)
}

export const blockText = (b: Block): string => shownText(b, stored)

const inlines = (b: Block): Inline[] => (b.type === 'list' ? (b.items ?? []).flatMap((it) => [...itemContent(it), ...nestedOf(it).flatMap(inlines)]) : b.content ?? [])

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

const EMPTYABLE = new Set(['paragraph', 'heading', 'list', 'blockquote', 'text', 'strong', 'em', 'underline', 'strikethrough', 'code'])
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
