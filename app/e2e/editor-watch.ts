import type {Page, TestInfo} from '@playwright/test'

type Watched = {editorWatch: string[]}

const watch = () => {
  const t0 = performance.now()
  const log: string[] = []
  ;(window as unknown as Watched).editorWatch = log
  const say = (s: string) => log.push(`${Math.round(performance.now() - t0)} ${s}`)
  const wordsIn = (text: string) => JSON.stringify([...text.matchAll(/\\*"value\\*":\\*"([^"\\]*)/g)].map((m) => m[1]))
  const words = (b: unknown) => wordsIn(JSON.stringify(b ?? null))
  const lines = () => JSON.stringify([...document.querySelectorAll('[contenteditable="true"] p')].map((p) => p.textContent))
  const caret = () => {
    const at = getSelection()?.focusNode
    const el = at instanceof Element ? at : at?.parentElement
    return JSON.stringify(el?.closest('[contenteditable="true"] p')?.textContent ?? document.activeElement?.tagName ?? null)
  }
  document.addEventListener('selectionchange', () => say(`caret ${caret()}`))
  type Tr = {docChanged: boolean; selection: {head: number}; meta: Record<string, unknown>}
  type View = {state: {selection: {head: number}}; dispatch(tr: Tr): void; updateState(state: unknown): void; watched?: boolean}
  const from = () => (new Error().stack ?? '').split('\n').slice(3, 6).map((l) => l.trim().replace(/\(?https?:\/\/[^/]+/, '(')).join(' < ')
  const watchView = () => {
    const view = (document.querySelector('[contenteditable="true"]') as (Element & {editor?: {view?: View}}) | null)?.editor?.view
    if (!view || view.watched) return
    view.watched = true
    const dispatch = view.dispatch
    view.dispatch = function (this: View, tr: Tr) {
      say(`dispatch sel ${this.state.selection.head}→${tr.selection.head}${tr.docChanged ? ' doc' : ''} meta [${Object.keys(tr.meta)}] caret ${caret()} from ${from()}`)
      return dispatch.call(this, tr)
    }
    const updateState = view.updateState
    view.updateState = function (this: View, state: unknown) {
      say(`updateState sel ${this.state.selection.head}→${(state as View['state']).selection.head} caret ${caret()}`)
      return updateState.call(this, state)
    }
  }
  document.addEventListener('keydown', (e) => (watchView(), say(`key ${e.key}`)), true)
  document.addEventListener('focusin', (e) => say(`focus ${(e.target as Element).tagName}`), true)
  document.addEventListener('bp-canvas-ops', (e) => say(`ops ${JSON.stringify((e as CustomEvent).detail)} lines ${lines()}`), true)
  addEventListener('barkpark-answered', () => say('answered'))
  customElements.whenDefined('bp-paper-canvas').then(() => {
    const proto = customElements.get('bp-paper-canvas')!.prototype as Record<string, (...a: unknown[]) => unknown>
    for (const name of ['applyServerBlocks', 'acknowledgeOps', 'flushPendingChanges']) {
      const was = proto[name]
      proto[name] = function (this: unknown, ...a: unknown[]) {
        const what = name === 'applyServerBlocks' ? ` ${(a[1] as {mode?: string} | undefined)?.mode ?? 'remote'} ${words(a[0])}` : name === 'acknowledgeOps' ? ` ${JSON.stringify(a)}` : ''
        say(`${name}${what} caret ${caret()} lines ${lines()}`)
        const out = was.apply(this, a)
        if (name === 'applyServerBlocks' || name === 'acknowledgeOps') say(`  then caret ${caret()} lines ${lines()}`)
        return out
      }
    }
  })
  const Stream = window.EventSource
  window.EventSource = class extends Stream {
    constructor(url: string | URL, init?: EventSourceInit) {
      super(url, init)
      say(`stream open ${String(url).replace(/^[^?]*/, '')}`)
      this.addEventListener('welcome', () => say('stream welcome'))
      this.addEventListener('error', () => say('stream error'))
      this.addEventListener('mutation', (e) => {
        const data = String((e as MessageEvent).data)
        const f = (() => {
          try {
            return JSON.parse(data) as {eventId?: number; mutation?: string; type?: string; documentId?: string; rev?: string; previousRev?: string | null}
          } catch {
            return null
          }
        })()
        say(f ? `frame ${f.eventId} ${f.mutation} ${f.type} ${f.documentId} ${f.previousRev?.slice(0, 8)}→${f.rev?.slice(0, 8)} ${wordsIn(data)}` : `frame unreadable ${data.slice(0, 80)}`)
      })
    }
  }
  const send = window.fetch
  window.fetch = (...a: Parameters<typeof fetch>) => {
    const body = typeof a[1]?.body === 'string' ? a[1].body : ''
    const push = body.includes('mutations')
    if (push) say('push sent')
    const answer = send(...a)
    if (push) answer.then((r) => say(`push answered ${r.status}`), () => say('push failed'))
    return answer
  }
}

let watched: Page | undefined

export async function watchEditor(page: Page) {
  watched = page
  await page.addInitScript(watch)
}

export async function printWatchOnFail(info: TestInfo) {
  const page = watched
  watched = undefined
  if (!page || info.status === info.expectedStatus) return
  const log = await page.evaluate(() => (window as unknown as Partial<Watched>).editorWatch ?? []).catch(() => ['the page was gone'])
  console.log(`EDITOR WATCH ${info.title}\n  ${log.join('\n  ')}\nEDITOR WATCH END`)
}
