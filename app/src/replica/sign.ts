import {NOTE_FIELDS, type NoteDoc} from './note.ts'

export const UNSIGNED = 'unsigned'

const empty = (x: unknown) => x == null || x === ''

export function canon(v: unknown): string {
  if (empty(v)) return 'null'
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (typeof v !== 'object') return JSON.stringify(v)
  const o = v as Record<string, unknown>
  const keys = Object.keys(o).filter((k) => !empty(o[k])).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`
}

function digest(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

const sum = (n: NoteDoc) => digest(canon(NOTE_FIELDS.map((f) => n[f])))

export const sign = (n: NoteDoc, me: string): NoteDoc => ({...n, by: `${me}.${sum(n)}`})

export function writerOf(n: NoteDoc): string | undefined {
  const dot = n.by?.lastIndexOf('.') ?? -1
  return dot > 0 && n.by!.slice(dot + 1) === sum(n) ? n.by!.slice(0, dot) : undefined
}
