import {blockText} from '../lib/model.ts'
import type {NoteDoc, Ref} from '../replica/note.ts'

export type Version = {part: string; text: string; by: string; step: number}

const key = (part: string, text: string) => `${part}\n${text}`

export type Held = Pick<NoteDoc, 'title' | 'body' | 'tags'> & {notebook?: Ref | null}

export function partsOf(n: Held): [string, string][] {
  const organized: [string, string][] = [...(n.tags ? [['tags', JSON.stringify(n.tags)] as [string, string]] : []), ...(n.notebook ? [['notebook', n.notebook._ref] as [string, string]] : [])]
  return [['title', n.title ?? ''], ...organized, ...(n.body?.blocks ?? []).map((b): [string, string] => [`body:${b.id}`, blockText(b)])]
}

export function truth() {
  const versions = new Map<string, Version>()
  const retired = new Set<string>()
  let last: {holders: unknown[]; size: number; out: Version[]} | undefined
  return {
    wrote: (v: Version) => void versions.set(key(v.part, v.text), v),
    editedFrom: (part: string, text: string) => void retired.add(key(part, text)),
    author: (part: string, text: string) => versions.get(key(part, text))?.by,
    lost(holders: (NoteDoc | null | undefined)[]): Version[] {
      const size = versions.size + retired.size
      if (last && last.size === size && last.holders.every((h, i) => h === holders[i])) return last.out
      const held = new Set(holders.flatMap((n) => (n ? [n, ...(n.conflicts ?? [])] : [])).flatMap((n) => partsOf(n).map(([p, t]) => key(p, t))))
      const out = [...versions].filter(([k]) => !retired.has(k) && !held.has(k)).map(([, v]) => v)
      last = {holders, size, out}
      return out
    },
  }
}

export type Truth = ReturnType<typeof truth>
