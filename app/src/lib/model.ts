export type Inline = {type: string; value?: string; docId?: string; target?: string; alias?: string; children?: Inline[]}
export type Item = Inline[] | {content?: Inline[]; checked?: boolean}
export type Block = {id: string; type: string; level?: number; text?: string; content?: Inline[]; items?: Item[]; task?: boolean; ordered?: boolean; caption?: string}

export type Conflict = {_key: string; by?: string; at: string; title?: string; body?: {blocks: Block[]}; tags?: string[]; notebook?: {_ref: string; _type?: string} | null; clash: string[]}
export type Note = {id: string; title: string; notebook: string | null; tags: string[]; blocks: Block[]; links: string[]; updatedAt: string; rev: string; conflicts: Conflict[]; gen: number}
export type Notebook = {id: string; name: string; parent: string | null}
export type Library = {notes: Note[]; notebooks: Notebook[]}
export type Prefs = {shortcuts: string[]; recents: string[]}

export const UNTITLED = 'Untitled'

export const itemContent = (it: Item): Inline[] => (Array.isArray(it) ? it : it.content ?? [])

export type Title = (id?: string) => string | undefined

export const titleIn =
  (byId: ReadonlyMap<string | undefined, Note>): Title =>
  (id) => {
    const n = byId.get(id)
    return n && (n.title || UNTITLED)
  }

const stored: Title = () => undefined

function inline(c: Inline[], title: Title): string {
  return c.map((x) => (x.type === 'text' ? x.value : x.type === 'wikilink' ? linkWords(x, title) : '')).join('')
}

export function linkWords(x: Inline, title: Title): string {
  const words = inline(x.children ?? [], title)
  return (x.alias == null && words === x.target && title(x.docId)) || words
}

export const linkMissing = (x: Inline, title: Title): boolean => !title(x.docId)

export const inlineText = (c: Inline[] = []): string => inline(c, stored)

export function shownText(b: Block, title: Title): string {
  if (b.type === 'heading') return b.text ?? inline(b.content ?? [], title)
  if (b.type === 'list') return (b.items ?? []).map((it) => inline(itemContent(it), title)).join(' · ')
  return inline(b.content ?? [], title)
}

export const blockText = (b: Block): string => shownText(b, stored)

const inlines = (b: Block): Inline[] => (b.type === 'list' ? (b.items ?? []).flatMap(itemContent) : b.content ?? [])

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

const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'list', 'blockquote'])

export const isBlank = (n: Note) => !n.title.trim() && n.blocks.every((b) => TEXT_BLOCKS.has(b.type) && !blockText(b).trim())

export const emptyParagraph = (id: string): Block => ({id, type: 'paragraph', content: []})
