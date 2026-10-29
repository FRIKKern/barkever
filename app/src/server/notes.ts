import '@tanstack/react-start/server-only'
import {BarkparkError, bpJson, dataset} from './barkpark'
import {linkRefs, toNote, toNotebook, type BpNote, type BpNotebook} from './note-docs'
import {emptyParagraph, wikilinks, type Block, type Library, type Note} from '../lib/model'

type Page<T> = {result: {documents: T[]; hasMore: boolean}}
type Mutated = {results: {document: BpNote}[]}

async function readAll<T>(type: string, order: string): Promise<T[]> {
  const docs: T[] = []
  for (let more = true; more; ) {
    const page = await bpJson<Page<T>>(`/v1/data/query/${dataset()}/${type}?perspective=drafts&order=${order}&limit=1000&offset=${docs.length}`)
    docs.push(...page.result.documents)
    more = page.result.hasMore && page.result.documents.length > 0
  }
  return docs
}

export async function readLibrary(): Promise<Library> {
  const [notes, notebooks] = await Promise.all([readAll<BpNote>('note', '_updatedAt:desc'), readAll<BpNotebook>('notebook', 'name:asc')])
  return {notes: notes.map(toNote), notebooks: notebooks.map(toNotebook)}
}

const mutate = async (mutations: unknown[]) => toNote((await bpJson<Mutated>(`/v1/data/mutate/${dataset()}`, 'POST', {mutations})).results[0].document)

export const createNote = ({id, notebook, blockId}: {id: string; notebook: string; blockId: string}): Promise<Note> =>
  mutate([{create: {_id: id, _type: 'note', title: '', notebook: {_type: 'reference', _ref: notebook}, tags: [], links: [], body: {blocks: [emptyParagraph(blockId)]}}}])

export const setTitle = ({id, title}: {id: string; title: string}): Promise<Note> => mutate([{patch: {id, type: 'note', set: {title}}}])

export type BodySave = {id: string; ops: unknown[]; rev: string; links: string[]}
export type BodySaved = {ok: true; rev: string; blocks: Block[]; links: string[]} | {ok: false; status: number; error: string}

export async function saveBody({id, ops, rev, links}: BodySave): Promise<BodySaved> {
  try {
    const {result} = await bpJson<{result: {rev: string; blocks: Block[]}}>(`/v1/data/doc/${dataset()}/note/${encodeURIComponent(id)}/fields/body/ops`, 'POST', {ops, ifRev: rev})
    const mirrored = wikilinks(result.blocks)
    if (mirrored.length === links.length && mirrored.every((l) => links.includes(l))) return {ok: true, rev: result.rev, blocks: result.blocks, links}
    const note = await mutate([{patch: {id, type: 'note', set: {links: linkRefs(mirrored)}, ifRevisionID: result.rev}}])
    return {ok: true, rev: note.rev, blocks: result.blocks, links: note.links}
  } catch (e) {
    if (e instanceof BarkparkError) return {ok: false, status: e.status, error: e.message}
    throw e
  }
}
