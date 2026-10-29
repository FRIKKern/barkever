import type {Block, Conflict} from '../lib/model'

export type Ref = {_ref: string; _key?: string; _type?: string}
export type Body = {blocks: Block[]}

export type NoteDoc = {
  _id: string
  _type: 'note'
  _rev?: string
  _updatedAt?: string
  title?: string
  notebook?: Ref
  tags?: string[]
  body?: Body
  links?: Ref[]
  conflicts?: Conflict[]
}
export type NotebookDoc = {_id: string; _type: 'notebook'; _rev?: string; name?: string; parent?: Ref}
export type Doc = NoteDoc | NotebookDoc
export type DocType = Doc['_type']
export type Row = {id: string; rev?: string}

export const NOTE_FIELDS = ['title', 'notebook', 'tags', 'body', 'links', 'conflicts'] as const

export const bare = (id: string) => id.replace(/^drafts\./, '')

export function fromServer(doc: Record<string, unknown>): Doc {
  const keys = doc._type === 'note' ? NOTE_FIELDS : (['name', 'parent'] as const)
  const out: Record<string, unknown> = {_id: bare(String(doc._id)), _type: doc._type, _rev: doc._rev, _updatedAt: doc._updatedAt}
  for (const k of keys) if (doc[k] !== undefined) out[k] = doc[k]
  return out as Doc
}

export const content = (note: NoteDoc) => Object.fromEntries(NOTE_FIELDS.filter((f) => note[f] !== undefined).map((f) => [f, note[f]]))

export const toRow = (note: NoteDoc): Row => ({id: note._id, rev: note._rev})
