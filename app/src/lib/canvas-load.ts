import noteSchema from '../../../contracts/barkpark/note.json' with {type: 'json'}
import type {Block} from './model'
import type {Candidate, Preview, Resolved} from './link-pick'
import type {CanvasFiles} from '../server/canvas'

export const vocabulary = JSON.stringify(noteSchema.fields.find((f) => f.name === 'body')!.blocks)

export type CanvasOps = {seq: number}
export type CanvasElement = HTMLElement & {
  blocks: Block[]
  acknowledgedSaves: boolean
  flushKeepsSource: boolean
  wikilinkSource: (query: string) => Candidate[]
  linkPreviewSource: (link: {kind: string; docId: string | null; target: string | null}) => Preview | null
  wikilinkResolve: (docId: string) => Resolved
  refreshWikilinks(): void
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

function linkOf(n: Node | null | undefined): string | null {
  const link = (n instanceof Element ? n : n?.parentElement)?.closest('[data-wikilink]')
  return link ? link.getAttribute('docid') || link.getAttribute('target') : null
}

export function linkAtCaret(el: CanvasElement): string | null {
  const sel = getSelection()
  const r = sel?.rangeCount ? sel.getRangeAt(0) : null
  if (!r?.collapsed || !el.contains(r.startContainer)) return null
  const {startContainer: at, startOffset: i} = r
  if (at.nodeType !== Node.TEXT_NODE) return linkOf(at.childNodes[i - 1]) ?? linkOf(at.childNodes[i])
  return linkOf(at) ?? (i === 0 ? linkOf(at.previousSibling) : null) ?? (i === at.textContent!.length ? linkOf(at.nextSibling) : null)
}

let loading: Promise<void> | null = null

class Outdated extends Error {}

export const CANVAS_CONTRACT = '1.20.0'

export function atLeast(version: string | undefined, want: string): boolean {
  const [a, b] = [version ?? '', want].map((v) => v.split('.').map(Number))
  const i = b.findIndex((n, k) => a[k] !== n)
  return i === -1 || a[i] > b[i]
}

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
    const version = (customElements.get('bp-paper-editor') as {CONTRACT_VERSION?: string} | undefined)?.CONTRACT_VERSION
    if (!atLeast(version, CANVAS_CONTRACT)) throw new Outdated(`Barkpark serves editor ${version ?? 'of unknown version'}; Barkever needs ${CANVAS_CONTRACT} or newer`)
  })().catch((e) => {
    if (!(e instanceof Outdated)) loading = null
    throw e
  })
  return loading
}
