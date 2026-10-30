import {partsOf, type Held} from './truth.ts'
import type {Block, Conflict} from '../lib/model.ts'
import type {NoteDoc} from '../replica/note.ts'

export const para = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
export const textOf = (n: Held, part: string) => partsOf(n).find(([p]) => p === part)?.[1] ?? ''

export function edited(old: string, token: string, mode: number, where: number) {
  if (mode < 0.5 || !old) return old ? `${old} ${token}` : token
  if (mode < 0.8) {
    const words = old.split(' ')
    words.splice(Math.floor(where * (words.length + 1)), 0, token)
    return words.join(' ')
  }
  return token
}
export const modeName = (mode: number) => (mode < 0.5 ? 'types at the end of' : mode < 0.8 ? 'types in the middle of' : 'types over')
export const placeOf = (part: string) => (part === 'title' ? 'the title' : `block ${part.slice(5)}`)

export const retagged = (tags: string[], token: string, b: number) => (b < 0.5 || !tags.length ? [...tags, token.toLowerCase()] : tags.filter((_, i) => i !== Math.floor(b * tags.length)))

const organizing = (part: string) => part === 'tags' || part === 'notebook'
export const rawNext = (part: string, old: string, token: string, a: number, b: number) =>
  part === 'tags' ? JSON.stringify([...JSON.parse(old), token.toLowerCase()]) : part === 'notebook' ? `nb-${token}` : edited(old, token, b, (a * 7919) % 1)
export const rawVerb = (part: string, b: number) => (organizing(part) ? `sets the ${part}` : `${modeName(b)} ${placeOf(part)}`)
export const rawWrite =
  (part: string, next: string) =>
  (d: NoteDoc): NoteDoc =>
    part === 'tags'
      ? {...d, tags: JSON.parse(next)}
      : part === 'notebook'
        ? {...d, notebook: {_type: 'reference', _ref: next}}
        : part === 'title'
          ? {...d, title: next}
          : {...d, body: {blocks: (d.body?.blocks ?? []).map((x) => (`body:${x.id}` === part ? para(x.id, next) : x))}}

export const show = (n: NoteDoc | null | undefined) => {
  if (!n) return 'none'
  const one = (v: Held) => partsOf(v).map(([p, t]) => `${p === 'title' ? '' : `${p.replace(/^body:/, '')}:`}"${t}"`).join(' ')
  return `${one(n)}${(n.conflicts ?? []).map((c: Conflict) => `\n      copy ${c._key} by ${c.by}: ${one(c)} clash ${c.clash.join(',')}`).join('')}`
}
