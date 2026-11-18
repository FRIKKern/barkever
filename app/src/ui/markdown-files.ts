import {useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {validate} from 'portable-doc/packages/validate/index.js'
import {refresh} from '../lib/library'
import {fromMarkdown, sortFiles} from '../lib/markdown-in'
import {fileNames, toMarkdown} from '../lib/markdown-out'
import {emptyParagraph, UNTITLED, type Note} from '../lib/model'
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

const stem = (name: string) => {
  const s = name.replace(/\.[^.]+$/, '').trim()
  return s === UNTITLED ? '' : s
}

const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`

async function importFiles(files: File[], w: World, s: Search) {
  const spot = landing(s, w.shelf)
  if (!spot) return {made: [], line: 'Make a notebook first, then import.'}
  const {take, skip} = sortFiles(files)
  const texts = await Promise.all(take.map((f) => f.text()))
  const ids = take.map(() => `note-${crypto.randomUUID()}`)
  const nobody = {id: () => '', resolve: () => undefined}
  const titles = take.map((f, i) => fromMarkdown(texts[i], {...nobody, fallback: stem(f.name)}).title)
  const known = new Map(w.lib.notes.filter((n) => n.title.trim()).map((n) => [n.title.trim().toLowerCase(), n.id]))
  titles.forEach((t, i) => t.trim() && known.set(t.trim().toLowerCase(), ids[i]))
  const resolve = (t: string) => known.get(t.trim().toLowerCase())
  const made: string[] = []
  for (const [i, f] of take.entries()) {
    const id = ids[i]
    let n = 0
    const parsed = fromMarkdown(texts[i], {fallback: stem(f.name), id: () => `${id}-m${++n}`, resolve})
    if (!validate({blocks: parsed.blocks}).ok) {
      skip.push({name: f.name, why: 'could not be read'})
      continue
    }
    const tags = [...spot.tags, ...parsed.tags].filter((t, k, all) => all.findIndex((x) => sameTag(x, t)) === k)
    const first = `${id}-p0`
    await createNote({id, notebook: spot.notebook, tags, blockId: first})
    if (parsed.title) await editTitle(id, '', parsed.title)
    if (parsed.blocks.length) await editBody(id, [emptyParagraph(first)], parsed.blocks)
    made.push(id)
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
