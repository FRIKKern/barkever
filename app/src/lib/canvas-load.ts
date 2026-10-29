import noteSchema from '../../../contracts/barkpark/note.json' with {type: 'json'}
import type {Block} from './model'
import type {CanvasFiles} from '../server/canvas'

export const vocabulary = JSON.stringify(noteSchema.fields.find((f) => f.name === 'body')!.blocks)

export type CanvasOps = {seq: number}
export type CanvasElement = HTMLElement & {
  blocks: Block[]
  acknowledgedSaves: boolean
  identifyOpsRequest(seq: number, requestId: string): void
  applyServerBlocks(blocks: Block[], o?: {mode: 'own'; requestId: string}): void
  flushPendingChanges(): boolean
  acknowledgeOps(seq: number, ok: boolean): void
}

type Typed = HTMLElement & {editor?: {view?: {domObserver?: {forceFlush(): void; flush(): void}}}}

export function readTyping(el: CanvasElement) {
  const seen = el.querySelector<Typed>('[contenteditable="true"]')?.editor?.view?.domObserver
  seen?.forceFlush()
  seen?.flush()
}

const add = <T extends HTMLElement>(el: T) => (document.head.append(el), el)

let loading: Promise<void> | null = null

async function canvasFiles(): Promise<CanvasFiles> {
  const res = await fetch('/editor-files').catch(() => undefined)
  if (res?.ok) return res.json()
  throw new Error(res ? `Barkpark ${res.status}` : 'offline, and it is not on this device yet')
}

export function loadCanvas(): Promise<void> {
  loading ??= (async () => {
    const files = await canvasFiles()
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
