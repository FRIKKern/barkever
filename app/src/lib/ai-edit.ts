import {asked, type AskNote, type Citation} from './ask.ts'
import {contentOf, inlineText, type Block, type Note} from './model.ts'

export type EditBlock = {id: string; text: string}
export type EditRequest = {instruction: string; note: {id: string; title: string}; blocks: EditBlock[]; notes: AskNote[]}
export type Change = {block: string; after: string}
export type Edited = {changes: Change[]; citations: Citation[]; provider: string; model: string; tokens: number; costUsd: number | null; read: number}
export type EditReply = Edited | {error: string}

const plain = (b: Block) => (b.type === 'paragraph' || b.type === 'heading') && contentOf(b).every((x) => x.type === 'text')

export const textOf = (b: Block) => inlineText(contentOf(b))

export const editable = (blocks: Block[], ids: string[]): EditBlock[] => blocks.filter((b) => ids.includes(b.id) && plain(b)).map((b) => ({id: b.id, text: textOf(b)}))

export const editRequest = (note: Note, instruction: string, blocks: EditBlock[]): EditRequest => ({instruction, note: {id: note.id, title: note.title}, blocks, notes: [asked(note)]})

export const rewrite = (blocks: Block[], c: Change): Block[] =>
  blocks.map((b) => (b.id !== c.block ? b : b.content || !b.text ? {...b, content: [{type: 'text', value: c.after}]} : {...b, text: c.after}))
