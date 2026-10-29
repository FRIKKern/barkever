import type {NoteDoc, Ref} from './note.ts'

type Change = [shown: Partial<NoteDoc>, after: Partial<NoteDoc>]

const ref = (id: string): Ref => ({_type: 'reference', _ref: id})

export const move = (n: NoteDoc, from: string | null, to: string): Change => [{notebook: n.notebook?._ref === from ? n.notebook : from ? ref(from) : undefined}, {notebook: ref(to)}]

export const tagsTo = (shown: string[], tags: string[]): Change => [{tags: shown}, {tags}]
