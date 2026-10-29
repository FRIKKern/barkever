import {readFileSync} from 'node:fs'
import {cli} from '../account.ts'
import type {Block} from '../../src/lib/model.ts'
import {fromServer, type Doc, type NoteDoc as Note} from '../../src/replica/note.ts'
import type {Draft, Made, Op, Writer} from './writer.ts'

type Page = {result: {documents: Record<string, unknown>[]; hasMore: boolean}}

const repo = (path: string) => new URL(`../../../${path}`, import.meta.url)

export function j10Dataset(): string {
  const name = process.env.J10_DATASET ?? ''
  if (!/^j10-\d+$/.test(name)) throw new Error(`J10 only writes to a j10-<stamp> dataset, not "${name}"`)
  return name
}

function bp(path: string, init: RequestInit = {}): Promise<Response> {
  const {server, token} = cli()
  return fetch(`${server}/w/barkever/p/default${path}`, {...init, headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'}})
}

async function write(mutations: object[]) {
  const res = await bp(`/v1/data/mutate/${j10Dataset()}`, {method: 'POST', body: JSON.stringify({mutations})})
  if (!res.ok) throw new Error(`Barkpark mutate ${res.status}`)
}

async function readAll(type: string): Promise<Record<string, unknown>[]> {
  const docs: Record<string, unknown>[] = []
  for (let more = true; more; ) {
    const res = await bp(`/v1/data/query/${j10Dataset()}/${type}?perspective=drafts&order=_id:asc&limit=1000&offset=${docs.length}`)
    if (!res.ok) throw new Error(`Barkpark query ${res.status}`)
    const page = (await res.json()) as Page
    docs.push(...page.result.documents)
    more = page.result.hasMore && page.result.documents.length > 0
  }
  return docs
}

export function fixtures(): Doc[] {
  return readFileSync(repo('fixtures/notes.ndjson'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
}

export async function createDataset() {
  const name = j10Dataset()
  for (const type of ['notebook', 'note']) {
    const res = await bp(`/v1/schemas/${name}`, {method: 'POST', body: readFileSync(repo(`contracts/barkpark/${type}.json`))})
    if (!res.ok) throw new Error(`schema ${type} ${res.status}`)
  }
  await write(fixtures().map((d) => ({createOrReplace: d})))
}

export async function snapshot(): Promise<Map<string, Doc>> {
  j10Dataset()
  const docs = (await Promise.all(['note', 'notebook'].map((t) => readAll(t)))).flat()
  return new Map(docs.map((d) => fromServer(d)).map((d) => [d._id, d]))
}

export const drafts = (docs: Doc[]) => new Map(docs.filter((d): d is Note => d._type === 'note').map((n) => [n._id, {title: n.title ?? '', blocks: n.body?.blocks ?? []} as Draft]))

export async function serverBurst(writer: Writer, ops: Op[] | number) {
  j10Dataset()
  const mutations: object[] = []
  const queue = typeof ops === 'number' ? Array.from({length: ops}, () => () => writer.next()) : ops.map((op) => () => op)
  for (const draw of queue) {
    const op = draw()
    const made: Made = {}
    if (op.kind === 'create') {
      made.note = `j10s-${writer.counts.create}`
      made.block = `${made.note}-p0`
    }
    writer.done(op, made)
    if (op.kind === 'delete') mutations.push({delete: {id: op.note, type: 'note', force: true}})
    else if (op.kind === 'title') mutations.push({patch: {id: op.note, type: 'note', set: {title: op.text}}})
    else if (op.kind === 'create') {
      const d = writer.notes.get(made.note!)!
      mutations.push({createOrReplace: {_id: made.note, _type: 'note', title: d.title, notebook: {_ref: 'fx-nb-inbox'}, tags: [], links: [], body: {blocks: d.blocks}}})
    } else mutations.push({patch: {id: op.note, type: 'note', set: {body: {blocks: writer.notes.get(op.note)!.blocks as Block[]}}}})
  }
  if (mutations.length) await write(mutations)
}
