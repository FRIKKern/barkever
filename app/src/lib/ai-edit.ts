import {validate, type ValidationError} from 'portable-doc/packages/validate/index.js'
import {asked, type AskNote, type Citation} from './ask.ts'
import {contentOf, inlineText, type Block, type Note} from './model.ts'

export type EditBlock = {id: string; text: string}
export type EditRequest = {instruction: string; note: {id: string; title: string}; blocks: EditBlock[]; notes: AskNote[]}
export type Change = {block: string; after: string}
export type Edited = {changes: Change[]; citations: Citation[]; provider: string; model: string; tokens: number; costUsd: number | null; read: number}
export type EditReply = Edited | {error: string}

const plain = (b: Block) => (b.type === 'paragraph' || b.type === 'heading') && contentOf(b).every((x) => x.type === 'text')

export const textOf = (b: Block) => inlineText(contentOf(b))

export const editable = (blocks: Block[], ids: string[]): EditBlock[] => blocks.filter((b) => ids.includes(b.id) && plain(b)).map((b) => ({id: b.id, text: textOf(b)}))

export const editRequest = (note: Note, instruction: string, blocks: EditBlock[]): EditRequest => ({instruction, note: {id: note.id, title: note.title}, blocks, notes: [asked(note)]})

export const rewrite = (blocks: Block[], c: Change): Block[] =>
  blocks.map((b) => (b.id !== c.block ? b : b.content ? {...b, content: [{type: 'text', value: c.after}]} : {...b, text: c.after}))

const problemsOf = (blocks: Block[]) => {
  const r = validate({blocks})
  return r.ok ? [] : r.errors
}

const ownId = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) && typeof (x as {id?: unknown}).id === 'string' ? (x as {id: string}).id : '')

const placeOf = (e: ValidationError, blocks: Block[]) => {
  const steps = e.path.split('/').slice(1)
  let at: unknown = {blocks}
  let id = ''
  let from = 0
  steps.forEach((step, i) => {
    if (ownId(at)) [id, from] = [ownId(at), i]
    at = (at as Record<string, unknown> | undefined)?.[step]
  })
  if (ownId(at)) [id, from] = [ownId(at), steps.length]
  const rest = steps.slice(from)
  return JSON.stringify([e.code, id, id ? rest.map(anyIndex) : rest])
}

const anyIndex = (step: string) => (/^\d+$/.test(step) ? '*' : step)

export type Problems = {added: ValidationError[]; old: ValidationError[]}

export function newProblems(pre: Block[], after: Block[]): Problems {
  const known = new Map<string, number>()
  for (const e of problemsOf(pre)) {
    const place = placeOf(e, pre)
    known.set(place, (known.get(place) ?? 0) + 1)
  }
  const added: ValidationError[] = []
  const old: ValidationError[] = []
  for (const e of problemsOf(after)) {
    const place = placeOf(e, after)
    const n = known.get(place)
    if (!n) added.push(e)
    else {
      known.set(place, n - 1)
      old.push(e)
    }
  }
  return {added, old}
}

const named = 5

export const reason = (errors: ValidationError[]) => {
  const shown = errors.slice(0, named).map((e) => `${e.message} at ${e.path}`).join('; ')
  return errors.length > named ? `${shown} and ${errors.length - named} more` : shown
}

export function verdict({added, old}: Problems, reply: Edited): {reply: EditReply; old: string | null} {
  if (added.length) return {reply: {error: `The change would break this note: ${reason(added)}`}, old: null}
  return {reply, old: old.length ? reason(old) : null}
}

export const checked = (pre: Block[], reply: EditReply) => ('error' in reply ? {reply, old: null} : verdict(newProblems(pre, reply.changes.reduce(rewrite, pre)), reply))
