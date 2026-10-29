import raw from '../../../fixtures/notes.ndjson?raw'

export type Ref = {_ref: string; _key?: string}
export type Inline = {type: 'text'; value: string} | {type: 'wikilink'; target: string; docId: string; children: Inline[]}
export type Block =
  | {id: string; type: 'heading'; level: number; text: string}
  | {id: string; type: 'paragraph'; content: Inline[]}
  | {id: string; type: 'list'; ordered: boolean; task?: boolean; items: (Inline[] | {content: Inline[]; checked: boolean})[]}
export type Note = {
  _id: string; _type: 'note'; title: string; notebook: Ref; tags: string[]; body: {blocks: Block[]}; links: Ref[]
  _rev?: string
  _updatedAt: string
}
export type Notebook = {_id: string; _type: 'notebook'; name: string; parent?: Ref; _rev?: string}
export type Row = {id: string; title: string; notebook: string; updatedAt: string}

const lines = raw.trim().split('\n').map((l) => JSON.parse(l))
export const stamp = (i: number) => new Date(Date.parse('2026-10-01T12:00:00Z') - i * 60_000).toISOString()
export const notebooks: Notebook[] = lines.filter((d) => d._type === 'notebook')
export const fixtureNotes: Note[] = lines.filter((d) => d._type === 'note').map((d, i) => ({...d, _updatedAt: stamp(i)}))

const inlineText = (xs: Inline[]): string => xs.map((x) => (x.type === 'text' ? x.value : inlineText(x.children))).join('')
export const plain = (body: {blocks: Block[]}): string =>
  body.blocks
    .map((b) => (b.type === 'heading' ? b.text : b.type === 'paragraph' ? inlineText(b.content) : b.items.map((it) => inlineText(Array.isArray(it) ? it : it.content)).join('\n')))
    .join('\n')

export const bodyFromText = (id: string, text: string) => ({
  blocks: text.split('\n').map((line, j): Block => ({id: `${id}-e${j}`, type: 'paragraph', content: [{type: 'text', value: line}]})),
})

export const toRow = (x: Note): Row => ({id: x._id, title: x.title, notebook: x.notebook._ref, updatedAt: x._updatedAt})
