import {validate} from 'portable-doc/packages/validate/index.js'
import {decodeText, fromMarkdown, resolveLinks, sortFiles} from './markdown-in.ts'
import {UNTITLED, type Block, type Note} from './model.ts'

export type Picked = {name: string; size: number; bytes: () => Promise<Uint8Array>}
export type Ready = {id: string; name: string; title: string; tags: string[]; blocks: Block[]}
export type Skipped = {name: string; why: string}

const stem = (name: string) => {
  const s = name.replace(/\.[^.]+$/, '').trim()
  return s === UNTITLED ? '' : s
}

const key = (title: string) => title.trim().toLowerCase()

export async function readImport(files: Picked[], notes: Note[], newId: () => string): Promise<{ready: Ready[]; skip: Skipped[]}> {
  const {take, skip} = sortFiles(files)
  const ready: Ready[] = []
  for (const f of take) {
    const text = decodeText(await f.bytes())
    if (text === null) {
      skip.push({name: f.name, why: 'not text'})
      continue
    }
    const id = newId()
    let n = 0
    const parsed = fromMarkdown(text, {fallback: stem(f.name), id: () => `${id}-m${++n}`, resolve: () => undefined})
    if (!validate({blocks: parsed.blocks}).ok) {
      skip.push({name: f.name, why: 'could not be read'})
      continue
    }
    ready.push({id, name: f.name, ...parsed})
  }
  const known = new Map(notes.filter((n) => n.title.trim()).map((n) => [key(n.title), n.id]))
  for (const r of ready) if (r.title.trim()) known.set(key(r.title), r.id)
  const resolve = (t: string) => known.get(key(t))
  return {ready: ready.map((r) => ({...r, blocks: resolveLinks(r.blocks, resolve)})), skip}
}
