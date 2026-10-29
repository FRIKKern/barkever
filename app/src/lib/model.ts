export type Inline = {type: string; value?: string; docId?: string; target?: string; children?: Inline[]}
export type Item = Inline[] | {content?: Inline[]; checked?: boolean}
export type Block = {id: string; type: string; level?: number; text?: string; content?: Inline[]; items?: Item[]; task?: boolean; ordered?: boolean; caption?: string}

export type Conflict = {_key: string; by?: string; at: string; title?: string; body?: {blocks: Block[]}; clash: string[]}
export type Note = {id: string; title: string; notebook: string | null; tags: string[]; blocks: Block[]; links: string[]; updatedAt: string; rev: string; conflicts: Conflict[]; gen: number}
export type Notebook = {id: string; name: string; parent: string | null}
export type Library = {notes: Note[]; notebooks: Notebook[]}
export type Prefs = {shortcuts: string[]; recents: string[]}

export const UNTITLED = 'Untitled'

export const itemContent = (it: Item): Inline[] => (Array.isArray(it) ? it : it.content ?? [])

export const inlineText = (c: Inline[] = []): string =>
  c.map((x) => (x.type === 'text' ? x.value ?? '' : x.type === 'wikilink' ? inlineText(x.children) : '')).join('')

export function blockText(b: Block): string {
  if (b.type === 'heading') return b.text ?? inlineText(b.content)
  if (b.type === 'list') return (b.items ?? []).map((it) => inlineText(itemContent(it))).join(' · ')
  return inlineText(b.content)
}

const inlines = (b: Block): Inline[] => (b.type === 'list' ? (b.items ?? []).flatMap(itemContent) : b.content ?? [])

export function wikilinks(blocks: Block[]): string[] {
  const out = new Set<string>()
  const walk = (c: Inline[]) => c.forEach((x) => (x.type === 'wikilink' && (x.docId || x.target) ? out.add((x.docId || x.target)!) : walk(x.children ?? [])))
  blocks.forEach((b) => walk(inlines(b)))
  return [...out]
}

export function linkContext(blocks: Block[], target: string): string {
  const b = blocks.find((b) => wikilinks([b]).includes(target))
  return b ? blockText(b) : ''
}

export const noteText = (n: Note) => `${n.title} ${n.blocks.map(blockText).join(' ')} ${n.tags.join(' ')}`.toLowerCase()

export function snippet(n: Note): string {
  const b = n.blocks.find((b) => b.type === 'paragraph' && blockText(b).trim())
  return b ? blockText(b) : 'No text yet'
}

const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'list', 'blockquote'])

export const isBlank = (n: Note) => !n.title.trim() && n.blocks.every((b) => TEXT_BLOCKS.has(b.type) && !blockText(b).trim())

export const emptyParagraph = (id: string): Block => ({id, type: 'paragraph', content: []})
