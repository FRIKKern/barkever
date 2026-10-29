import noteSchema from '../../../contracts/barkpark/note.json' with {type: 'json'}
import {fetchCanvasFiles} from './library'
import type {Block} from './model'

export const vocabulary = JSON.stringify(noteSchema.fields.find((f) => f.name === 'body')!.blocks)

export type CanvasOps = {ops: unknown[]; seq: number}
export type CanvasElement = HTMLElement & {
  blocks: Block[]
  acknowledgedSaves: boolean
  identifyOpsRequest(seq: number, requestId: string): void
  applyServerBlocks(blocks: Block[], o: {mode: 'own'; requestId: string}): void
  acknowledgeOps(seq: number, ok: boolean): void
  discardInflightOps(seq: number, o: {reason: string}): void
}

const add = <T extends HTMLElement>(el: T) => (document.head.append(el), el)

let loading: Promise<void> | null = null

export function loadCanvas(): Promise<void> {
  loading ??= (async () => {
    const files = await fetchCanvasFiles()
    Object.assign(window, {BP_PAPER_EDITOR_NO_INJECT: true})
    for (const href of files.styles) add(Object.assign(document.createElement('link'), {rel: 'stylesheet', href}))
    await new Promise((ok, no) => add(Object.assign(document.createElement('script'), {src: files.script, onload: ok, onerror: () => no(new Error('the editor script did not load'))})))
    await customElements.whenDefined('bp-paper-canvas')
  })().catch((e) => {
    loading = null
    throw e
  })
  return loading
}

export const contractVersion = () => (customElements.get('bp-paper-editor') as {CONTRACT_VERSION?: string} | undefined)?.CONTRACT_VERSION ?? null
