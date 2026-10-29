import type {Block} from '../lib/model.ts'
import {collapse, linksFor} from './merge.ts'
import type {NoteDoc} from './note.ts'

function adopt(main: Block[], copy: Block[], ids: Set<string>): Block[] {
  const from = new Map(copy.map((b) => [b.id, b]))
  const out = main.flatMap((b) => (!ids.has(b.id) ? [b] : from.has(b.id) ? [from.get(b.id)!] : []))
  copy.forEach((b, i) => {
    if (!ids.has(b.id) || out.includes(b)) return
    const prev = copy.slice(0, i).reverse().find((x) => out.some((y) => y.id === x.id))
    out.splice(prev ? out.findIndex((y) => y.id === prev.id) + 1 : 0, 0, b)
  })
  return out
}

export const dismiss = (n: NoteDoc, key: string): NoteDoc => ({...n, conflicts: (n.conflicts ?? []).filter((c) => c._key !== key)})

export function keep(n: NoteDoc, key: string): NoteDoc {
  const c = n.conflicts?.find((x) => x._key === key)
  if (!c) return n
  const ids = new Set(c.clash.filter((p) => p.startsWith('body:')).map((p) => p.slice(5)))
  const blocks = adopt(n.body?.blocks ?? [], c.body?.blocks ?? [], ids)
  const out: NoteDoc = {...n, title: c.clash.includes('title') ? c.title : n.title, body: {...n.body, blocks}, links: linksFor(blocks, n.links)}
  return {...out, conflicts: collapse(dismiss(n, key).conflicts!, out)}
}
