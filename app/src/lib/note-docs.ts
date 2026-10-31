import type {Block, Conflict, Note, Notebook} from './model.ts'

type BpRef = {_ref?: string} | null
export type BpNote = {_id: string; _rev?: string; _updatedAt?: string; title?: string | null; notebook?: BpRef; tags?: string[] | null; links?: BpRef[] | null; body?: {blocks?: Block[]} | null; conflicts?: Conflict[] | null}
export type BpNotebook = {_id: string; name?: string | null; parent?: BpRef}

export const bare = (id: string) => id.replace(/^drafts\./, '')
const ref = (r: BpRef | undefined) => (r?._ref ? bare(r._ref) : null)

export function toNote(d: BpNote): Note {
  return {
    id: bare(d._id),
    title: d.title?.trim() ? d.title : '',
    notebook: ref(d.notebook),
    tags: d.tags ?? [],
    blocks: d.body?.blocks ?? [],
    links: [...new Set((d.links ?? []).map(ref).filter((r): r is string => !!r))],
    updatedAt: d._updatedAt ?? '',
    rev: d._rev ?? '',
    conflicts: d.conflicts ?? [],
    gen: 0,
  }
}

export const toNotebook = (d: BpNotebook): Notebook => ({id: bare(d._id), name: d.name?.trim() || 'Untitled notebook', parent: ref(d.parent)})

export const linkRefs = (ids: string[]) => ids.map((id) => ({_type: 'reference', _ref: id, _key: id}))
