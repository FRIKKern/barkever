import type {NoteDoc, Ref} from './note.ts'

type Change = [shown: Partial<NoteDoc>, after: Partial<NoteDoc>]

const ref = (id: string): Ref => ({_type: 'reference', _ref: id})

export const move = (n: NoteDoc, from: string | null, to: string): Change => [{notebook: n.notebook?._ref === from ? n.notebook : from ? ref(from) : undefined}, {notebook: ref(to)}]

export const tagsTo = (shown: string[], tags: string[]): Change => [{tags: shown}, {tags}]

const sameTag = (a: string) => (b: string) => a.toLowerCase() === b.toLowerCase()

export function withTag(tags: string[], known: string[], typed: string): string[] {
  const t = typed.trim().replace(/^#+/, '').replace(/\s+/g, '-')
  if (!t || tags.some(sameTag(t))) return tags
  return [...tags, known.find(sameTag(t)) ?? t.toLowerCase()]
}
