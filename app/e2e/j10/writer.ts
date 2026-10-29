import {blockText, type Block} from '../../src/lib/model.ts'

const editable = (b: Block) => b.type === 'heading' || (b.type === 'paragraph' && (b.content ?? []).every((x) => x.type === 'text'))

export type Op =
  | {kind: 'type'; note: string; block: string; text: string}
  | {kind: 'title'; note: string; text: string}
  | {kind: 'add'; note: string; text: string}
  | {kind: 'drop'; note: string; block: string}
  | {kind: 'create'; title: string; text: string}
  | {kind: 'delete'; note: string}
  | {kind: 'link'; note: string; block: string; target: string}
export type Kind = Op['kind']
export type Made = {note?: string; block?: string; linked?: Block}
export type Draft = {title: string; blocks: Block[]}

const WORDS = 'harbor quarry lighthouse sitemap draft review tulip sourdough train budget sketch meeting timeline notes garden kitchen ferry window copy pages'.split(' ')

export function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class Writer {
  readonly notes = new Map<string, Draft>()
  readonly typed = new Map<string, Map<string, string>>()
  readonly counts: Record<Kind, number> = {type: 0, title: 0, add: 0, drop: 0, create: 0, delete: 0, link: 0}
  readonly protect = new Set<string>()
  readonly reserved = new Set<string>()
  readonly touched = new Map<string, Set<string>>()
  readonly deleted: string[] = []
  readonly dropped: [string, string][] = []
  private n = 0
  private readonly rand: () => number

  constructor(
    readonly name: string,
    seed: number,
    notes: Map<string, Draft>,
    pool: string[],
    private readonly weights: Partial<Record<Kind, number>>,
  ) {
    this.rand = seeded(seed)
    for (const id of pool) this.notes.set(id, structuredClone(notes.get(id)!))
  }

  private pickOf<T>(xs: T[]): T {
    return xs[Math.floor(this.rand() * xs.length)]
  }

  private words(k: number) {
    return Array.from({length: k}, () => this.pickOf(WORDS)).join(' ')
  }

  marker() {
    return `[${this.name}${++this.n}]`
  }

  textFor(note: string, block: string, say?: string) {
    const old = this.notes.get(note)!.blocks.find((b) => b.id === block)
    const prior = old?.type === 'heading' ? old.text : old?.content?.map((x) => ('value' in x ? x.value : '')).join('')
    return say ? `${say} ${this.marker()}` : `${prior ?? ''} ${this.words(2 + Math.floor(this.rand() * 5))} ${this.marker()}`.trim()
  }

  editableBlocks(note: string) {
    return this.notes.get(note)!.blocks.filter(editable)
  }

  next(): Op {
    const entries = Object.entries(this.weights) as [Kind, number][]
    for (;;) {
      let x = this.rand() * entries.reduce((s, [, w]) => s + w, 0)
      const kind = entries.find(([, w]) => (x -= w) < 0)![0]
      const ids = [...this.notes.keys()].filter((id) => !this.reserved.has(id))
      const free = ids.filter((id) => !this.protect.has(id))
      if (kind === 'create') return {kind, title: `${this.words(2)} ${this.marker()}`, text: `${this.words(6)} ${this.marker()}`}
      if (kind === 'delete') {
        if (free.length > 5) return {kind, note: this.pickOf(free)}
        continue
      }
      const note = this.pickOf(kind === 'drop' ? free : ids)
      if (kind === 'title') return {kind, note, text: `${this.words(3)} ${this.marker()}`}
      if (kind === 'add') return {kind, note, text: `${this.words(5)} ${this.marker()}`}
      const blocks = this.editableBlocks(note)
      const later = this.notes.get(note)!.blocks.slice(1).filter(editable)
      if (kind === 'drop' && later.length) return {kind, note, block: this.pickOf(later).id}
      if (kind === 'type' && blocks.length) {
        const block = this.pickOf(blocks).id
        return {kind, note, block, text: this.textFor(note, block)}
      }
    }
  }

  done(op: Op, made: Made = {}) {
    this.counts[op.kind]++
    const touched = 'note' in op ? op.note : made.note!
    if (!this.touched.has(touched)) this.touched.set(touched, new Set())
    this.touched.get(touched)!.add(op.kind === 'title' ? 'title' : 'block' in op ? op.block : (made.block ?? op.kind))
    if (op.kind === 'delete') this.deleted.push(op.note)
    if (op.kind === 'drop') this.dropped.push([op.note, op.block])
    const write = (note: string, key: string, text: string) => {
      if (!this.typed.has(note)) this.typed.set(note, new Map())
      this.typed.get(note)!.set(key, text)
    }
    const draft = 'note' in op ? this.notes.get(op.note) : undefined
    const setText = (b: Block, text: string): Block => (b.type === 'heading' ? {...b, text} : {...b, content: [{type: 'text', value: text}]})
    if (op.kind === 'type') {
      draft!.blocks = draft!.blocks.map((b) => (b.id === op.block ? setText(b, op.text) : b))
      write(op.note, op.block, op.text)
    } else if (op.kind === 'title') {
      draft!.title = op.text
      write(op.note, 'title', op.text)
    } else if (op.kind === 'add') {
      draft!.blocks.push({id: made.block!, type: 'paragraph', content: [{type: 'text', value: op.text}]})
      write(op.note, made.block!, op.text)
    } else if (op.kind === 'drop') {
      draft!.blocks = draft!.blocks.filter((b) => b.id !== op.block)
      this.typed.get(op.note)?.delete(op.block)
    } else if (op.kind === 'link') {
      draft!.blocks = draft!.blocks.map((b) => (b.id === op.block ? made.linked! : b))
      write(op.note, op.block, blockText(made.linked!))
    } else if (op.kind === 'create') {
      this.notes.set(made.note!, {title: op.title, blocks: [{id: made.block!, type: 'paragraph', content: [{type: 'text', value: op.text}]}]})
      write(made.note!, 'title', op.title)
      write(made.note!, made.block!, op.text)
    } else {
      this.notes.delete(op.note)
      this.typed.delete(op.note)
    }
  }
}
