import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {refresh} from '../lib/library'
import {readImport, type Picked} from '../lib/markdown-import'
import {fileNames, toMarkdown} from '../lib/markdown-out'
import {emptyParagraph, type Note} from '../lib/model'
import {landing, sameTag, type Search} from '../lib/scope'
import {zip} from '../lib/zip'
import {createNote, editBody, editTitle} from '../replica/local'
import type {World} from './world'

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], {type}))
  const a = Object.assign(document.createElement('a'), {href: url, download: name})
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const markdownOf = (n: Note, w: World) => toMarkdown(n, {title: w.links.title, notebook: w.shelf.path(n.notebook).join(' / ')})

export const exportNote = (n: Note, w: World) => download(fileNames([n.title])[0], markdownOf(n, w), 'text/markdown;charset=utf-8')

export function exportNotebook(nb: string, w: World) {
  const scope = w.shelf.scope(nb)
  const notes = w.lib.notes.filter((n) => n.notebook && scope.includes(n.notebook))
  const names = fileNames(notes.map((n) => n.title))
  const utf8 = new TextEncoder()
  const data = zip(notes.map((n, i) => ({name: names[i], data: utf8.encode(markdownOf(n, w))})))
  download(fileNames([w.shelf.byId.get(nb)?.name ?? 'Notebook'])[0].replace(/\.md$/, '.zip'), data, 'application/zip')
}

const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`

const picked = (f: File): Picked => ({name: f.name, size: f.size, bytes: async () => new Uint8Array(await f.arrayBuffer())})

async function importFiles(files: File[], w: World, s: Search) {
  const spot = landing(s, w.shelf)
  if (!spot) return {made: [], line: 'Make a notebook first, then import.'}
  const {ready, skip} = await readImport(files.map(picked), w.lib.notes, () => `note-${crypto.randomUUID()}`)
  const made: string[] = []
  for (const r of ready) {
    const tags = [...spot.tags, ...r.tags].filter((t, k, all) => all.findIndex((x) => sameTag(x, t)) === k)
    const first = `${r.id}-p0`
    try {
      await createNote({id: r.id, notebook: spot.notebook, tags, blockId: first})
      if (r.title) await editTitle(r.id, '', r.title)
      if (r.blocks.length) await editBody(r.id, [emptyParagraph(first)], r.blocks)
      made.push(r.id)
    } catch (e) {
      skip.push({name: r.name, why: e instanceof Error ? e.message : 'not saved'})
    }
  }
  const skipped = skip.length ? ` · skipped ${skip.map((x) => `${x.name} (${x.why})`).join(', ')}` : ''
  return {made, line: `Imported ${plural(made.length, 'note')}${skipped}`}
}

export function useImport(w: World, s: Search) {
  const qc = useQueryClient()
  const [line, setLine] = useState<string | null>(null)
  const start = (files: File[]) => {
    if (!files.length) return
    setLine(`Importing ${plural(files.length, 'file')}…`)
    void importFiles(files, w, s)
      .then(({made, line}) => (setLine(line), refresh(qc, made)))
      .catch((e: unknown) => setLine(`Import stopped: ${e instanceof Error ? e.message : String(e)}`))
  }
  return {start, line, clear: () => setLine(null)}
}

export type Import = ReturnType<typeof useImport>
