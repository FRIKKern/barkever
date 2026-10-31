import {expect, test, type Page} from '@playwright/test'
import {canvas, cleanup, errorsOf, newNote, status, twoBlockNote, typeAtEnd, type Pm} from './note'

test.afterAll(cleanup)

type Watched = Window & {lies?: string[]; mustStore?: string; stretch?: boolean; seen?: string[]; synced?: string}

const watchSaved = (page: Page) =>
  page.addInitScript(() => {
    const w = window as Watched
    w.lies = []
    w.seen = []
    const later = window.setTimeout
    const real = IDBObjectStore.prototype.getAllKeys
    IDBObjectStore.prototype.getAllKeys = function (this: IDBObjectStore, ...a: Parameters<typeof real>) {
      const req = real.apply(this, a)
      if (this.name !== 'outbox') return req
      const add = req.addEventListener.bind(req)
      req.addEventListener = ((type: string, fn: (e: Event) => void, o?: boolean) => add(type, type === 'success' ? (e: Event) => later(() => fn(e), 300) : fn, o)) as typeof req.addEventListener
      return req
    }
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => later(fn, w.stretch && (ms === 40 || ms === 300) ? 5000 : ms, ...a)) as typeof setTimeout
    let db: IDBDatabase | undefined
    let opening = false
    const open = async () => {
      opening = true
      const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))
      if (name) indexedDB.open(name).onsuccess = (e) => (db = (e.target as IDBOpenDBRequest).result)
      else opening = false
    }
    const opened = async () => {
      const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
      return new Promise<IDBDatabase>((ok) => (indexedDB.open(name).onsuccess = (e) => ok((e.target as IDBOpenDBRequest).result)))
    }
    const check = (id: string, at: number) => {
      if (!db) return void opened().then((d) => ((db = d), check(id, at)))
      const tx = db.transaction(['outbox', 'notes'])
      const get = <T,>(store: string) => new Promise<T>((ok) => (tx.objectStore(store).get(id).onsuccess = (e) => ok((e.target as IDBRequest<T>).result)))
      void Promise.all([get<unknown>('outbox'), get<{body?: unknown} | undefined>('notes')]).then(([entry, note]) => {
        if (entry !== undefined) w.lies!.push(`Saved at ${at} ms while ${id} waits in the outbox`)
        if (w.mustStore && !JSON.stringify(note?.body ?? '').includes(w.mustStore)) w.lies!.push(`Saved at ${at} ms before "${w.mustStore}" was stored`)
      })
    }
    const empty = (at: number) => {
      if (!db) return void opened().then((d) => ((db = d), empty(at)))
      db.transaction('outbox').objectStore('outbox').count().onsuccess = (e) => {
        const n = (e.target as IDBRequest<number>).result
        if (n) w.lies!.push(`Synced at ${at} ms with ${n} in the outbox`)
      }
    }
    new MutationObserver(() => {
      const synced = document.querySelector('[data-testid=sync-status]')?.textContent ?? ''
      if (synced !== w.synced && (w.synced = synced) === 'Synced') empty(Math.round(performance.now()))
      const now = document.querySelector('[data-testid=save-status]')?.textContent ?? ''
      const id = new URL(location.href).searchParams.get('n')
      if (!db && !opening) void open()
      if (now === w.seen!.at(-1)) return
      w.seen!.push(now)
      if (now === 'Saved' && id) check(id, Math.round(performance.now()))
    }).observe(document, {subtree: true, childList: true, characterData: true})
  })

const slowWire = (page: Page) =>
  page.route('**/*', async (r) => {
    if (r.request().method() === 'POST') await new Promise((ok) => setTimeout(ok, 1500))
    await r.fallback()
  })

const lies = (page: Page) => page.evaluate(() => (window as Watched).lies)

test('Saved never shows while the note still waits in the outbox, even with slow outbox reads and a slow wire', async ({page}) => {
  const errors = errorsOf(page)
  await watchSaved(page)
  await slowWire(page)
  await twoBlockNote(page, `Slow outbox ${Date.now()}`)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await page.waitForTimeout(500)
  expect(await lies(page)).toEqual([])
  expect(errors).toEqual([])
})

test('a reload while the note still waits in the outbox never shows Saved or Synced before the outbox is read', async ({page}) => {
  const errors = errorsOf(page)
  await watchSaved(page)
  await twoBlockNote(page, `Reload with a queue ${Date.now()}`)
  await slowWire(page)
  const sent = page.waitForRequest((r) => r.method() === 'POST' && !!r.postData()?.includes('Queued.'))
  await typeAtEnd(page, ' Queued.')
  await sent
  await page.reload()
  await expect(canvas(page)).toContainText('Queued.')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await page.waitForTimeout(500)
  expect(await lies(page)).toEqual([])
  expect(errors).toEqual([])
})

test('opening a saved note shows Saved at once, never a Saving flash, and a reload settles on Saved with no write', async ({page}) => {
  const errors = errorsOf(page)
  await watchSaved(page)
  const a = `Open saved A ${Date.now()}`
  await newNote(page, a)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await newNote(page, `Open saved B ${Date.now()}`)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await page.evaluate(() => ((window as Watched).seen = ['Saved']))
  await page.getByTestId('note-row').filter({hasText: a}).first().click()
  await expect(page.getByTestId('title')).toHaveValue(a)
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => (window as Watched).seen)).toEqual(['Saved'])
  await page.reload()
  await expect(status(page)).toHaveText('Saved', {timeout: 3000})
  expect(errors).toEqual([])
})

const late = (page: Page, how: 'title' | 'body' | 'title after') =>
  page.evaluate((how) => {
    const w = window as Watched
    w.stretch = true
    w.mustStore = 'Late body.'
    const el = document.querySelector('[data-testid=canvas]') as HTMLElement & {flushPendingChanges(): boolean}
    const ed = (el.querySelector('[contenteditable="true"]') as HTMLElement & {editor: Pm & {view: {domObserver: {flush(): void}}}}).editor
    const typeInBody = (text: string) => {
      const end = ed.state.doc.child(0).nodeSize - 1
      ed.view.focus()
      ed.commands.setTextSelection({from: end, to: end})
      document.execCommand('insertText', false, text)
    }
    const typeInTitle = () => {
      const t = document.querySelector<HTMLTextAreaElement>('[data-testid=title]')!
      t.focus()
      t.setSelectionRange(t.value.length, t.value.length)
      document.execCommand('insertText', false, '!')
    }
    if (how === 'title') typeInTitle()
    if (how === 'body') {
      typeInBody(' Early body.')
      ed.view.domObserver.flush()
      el.flushPendingChanges()
    }
    typeInBody(' Late body.')
    if (how === 'title after') typeInTitle()
  }, how)

for (const how of ['title', 'body', 'title after'] as const) {
  test(`a ${how === 'title after' ? 'title save after unflushed body typing' : `${how} save that started before more body typing`} never claims that typing`, async ({page}) => {
    const errors = errorsOf(page)
    await watchSaved(page)
    await twoBlockNote(page, `Late typing after a ${how} save ${Date.now()}`)
    await late(page, how)
    await page.waitForTimeout(2500)
    await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
    await page.waitForTimeout(500)
    expect(await lies(page)).toEqual([])
    expect(errors).toEqual([])
  })
}

test('an outbox read that lands after a newer one never leaves Saving stuck', async ({page}) => {
  const errors = errorsOf(page)
  await page.addInitScript(() => {
    const later = window.setTimeout
    const real = IDBObjectStore.prototype.getAllKeys
    IDBObjectStore.prototype.getAllKeys = function (this: IDBObjectStore, ...a: Parameters<typeof real>) {
      const req = real.apply(this, a)
      if (this.name !== 'outbox') return req
      const add = req.addEventListener.bind(req)
      req.addEventListener = ((type: string, fn: (e: Event) => void, o?: boolean) => add(type, type === 'success' ? (e: Event) => later(() => fn(e), req.result.length ? 1200 : 0) : fn, o)) as typeof req.addEventListener
      return req
    }
  })
  await newNote(page, `Stale read lands last ${Date.now()}`)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await page.waitForTimeout(2500)
  await expect(status(page)).toHaveText('Saved')
  expect(errors).toEqual([])
})

test('typing that changes nothing settles back on Saved', async ({page}) => {
  const errors = errorsOf(page)
  await twoBlockNote(page, `No net change ${Date.now()}`)
  const typed = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid=canvas] [contenteditable="true"]')!
    const before = el.textContent
    document.execCommand('insertText', false, 'x')
    const mid = el.textContent
    document.execCommand('delete')
    return mid !== before && el.textContent === before
  })
  expect(typed, 'x went in and came out in one task').toBe(true)
  await expect(status(page)).toHaveText('Saved', {timeout: 3000})
  await page.waitForTimeout(1000)
  await expect(status(page)).toHaveText('Saved')
  expect(errors).toEqual([])
})

test('an open dead-key composition never shows Saved, and a cancelled one settles back on Saved', async ({page}) => {
  const errors = errorsOf(page)
  await twoBlockNote(page, `Dead key ${Date.now()}`)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.imeSetComposition', {text: '´', selectionStart: 1, selectionEnd: 1})
  await expect(canvas(page)).toContainText('Theirs.´')
  await page.waitForTimeout(800)
  await expect(status(page)).not.toHaveText('Saved')
  await cdp.send('Input.insertText', {text: 'é'})
  await expect(canvas(page)).toContainText('Theirs.é')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await cdp.send('Input.imeSetComposition', {text: '´', selectionStart: 1, selectionEnd: 1})
  await expect(canvas(page)).toContainText('Theirs.é´')
  await cdp.send('Input.imeSetComposition', {text: '', selectionStart: 0, selectionEnd: 0})
  await expect(canvas(page)).not.toContainText('´')
  await expect(status(page)).toHaveText('Saved', {timeout: 3000})
  expect(errors).toEqual([])
})

test('a composition that ends with no input event after it stores its text before Saved, and never leaves Saving stuck', async ({page}) => {
  const errors = errorsOf(page)
  await watchSaved(page)
  await twoBlockNote(page, `Composition end alone ${Date.now()}`)
  const compose = (text: string) =>
    page.evaluate((text) => {
      const w = window as Watched
      if (text) w.mustStore = text
      const el = document.querySelector<HTMLElement>('[data-testid=canvas] [contenteditable="true"]')!
      el.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true, data: ''}))
      if (text) document.execCommand('insertText', false, text)
      else el.dispatchEvent(new InputEvent('input', {bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: ''}))
    }, text)
  const end = (data: string) => page.evaluate((data) => document.querySelector<HTMLElement>('[data-testid=canvas] [contenteditable="true"]')!.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data})), data)
  await compose('é')
  await page.waitForTimeout(800)
  await expect(status(page)).not.toHaveText('Saved')
  await end('é')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await expect(canvas(page)).toContainText('Theirs.é')
  await compose('')
  await page.waitForTimeout(800)
  await expect(status(page)).not.toHaveText('Saved')
  await end('')
  await expect(status(page)).toHaveText('Saved', {timeout: 3000})
  await page.waitForTimeout(500)
  expect(await lies(page)).toEqual([])
  expect(errors).toEqual([])
})

const truthProbe = (page: Page, id: string, base: string) =>
  page.evaluate(
    async ([id, base]) => {
      const w = window as Window & {lies?: string[]}
      w.lies = []
      const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
      const db = await new Promise<IDBDatabase>((ok) => (indexedDB.open(name).onsuccess = (e) => ok((e.target as IDBOpenDBRequest).result)))
      const read = <T,>(store: string) => new Promise<T>((ok) => (db.transaction(store).objectStore(store).get(id).onsuccess = (e) => ok((e.target as IDBRequest<T>).result)))
      const check = (what: string, needsPush: boolean) => {
        const at = Math.round(performance.now())
        const shown = (document.querySelector('[data-testid=canvas] [contenteditable="true"]')?.textContent ?? '').replace(/\u00a0/g, ' ')
        const typed = shown.slice(shown.lastIndexOf(base))
        const [note, entry] = [read<{body?: unknown}>('notes'), read<unknown>('outbox')]
        void Promise.all([note, entry]).then(([n, e]) => {
          if (!JSON.stringify(n?.body ?? '').includes(typed)) w.lies!.push(`${what} at ${at} ms before "${typed}", on screen, was stored`)
          else if (needsPush && e !== undefined) w.lies!.push(`${what} at ${at} ms while the note still waits in the outbox`)
        })
      }
      const shown = new Map(['save-status', 'sync-status'].map((t) => [t, document.querySelector(`[data-testid=${t}]`)?.textContent ?? '']))
      new MutationObserver(() => {
        for (const [testid, claims] of [['save-status', ['Saved', 'Offline · saved on this device']], ['sync-status', ['Synced']]] as const) {
          const now = document.querySelector(`[data-testid=${testid}]`)?.textContent ?? ''
          if (now !== shown.get(testid) && (claims as readonly string[]).includes(now)) check(now, now !== 'Offline · saved on this device')
          shown.set(testid, now)
        }
      }).observe(document, {subtree: true, childList: true, characterData: true})
    },
    [id, base],
  )

test('typed offline and back online within 50 ms: neither Saved nor Synced shows before the edit is stored and sent', async ({page, context}) => {
  const errors = errorsOf(page)
  const id = await newNote(page, `Status truth ${Date.now()}`)
  await expect(canvas(page).locator('[contenteditable="true"]')).toBeAttached()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Base.')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 15_000})
  await truthProbe(page, id, 'Base.')
  await context.setOffline(true)
  await page.keyboard.type(' Typed offline.')
  await context.setOffline(false)
  await expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 15_000})
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => (window as Window & {lies?: string[]}).lies)).toEqual([])
  expect(errors).toEqual([])
})
