import {expect, test, type Browser, type Page} from '@playwright/test'
import {deleteNotes} from './fixtures-cleanup'
import {SESSION_FILE} from './account'
import {clickCaret, focusSettled} from './caret'

const created: string[] = []
test.afterAll(() => deleteNotes(created))

const status = (page: Page) => page.getByTestId('save-status')
const canvas = (page: Page) => page.getByTestId('canvas')

async function newNote(page: Page, title: string) {
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 15_000})
  await expect(page.getByTestId('new-note')).toBeEnabled()
  await page.keyboard.press('n')
  await expect(page.getByTestId('title')).toBeFocused()
  const id = new URL(page.url()).searchParams.get('n')!
  created.push(id)
  await page.keyboard.type(title)
  return id
}

async function typeAtEnd(page: Page, text: string) {
  const editable = canvas(page).locator('[contenteditable="true"]')
  const last = editable.locator('> [data-bp-id]').last()
  await last.waitFor({state: 'attached'})
  const box = await last.boundingBox()
  if (box?.height) await clickCaret(last, {x: box.width - 2, y: box.height / 2})
  else await editable.focus().then(() => focusSettled(page))
  await page.keyboard.press('End')
  await page.keyboard.type(text)
}

const leave = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

async function onServer(browser: Browser, baseURL: string, id: string, title: string, texts: string[]) {
  const fresh = await browser.newContext({baseURL, storageState: SESSION_FILE})
  const page = await fresh.newPage()
  await page.goto(`/?n=${id}`)
  await expect(page.getByTestId('title')).toHaveValue(title, {timeout: 20_000})
  for (const t of texts) await expect(canvas(page)).toContainText(t)
  await fresh.close()
}

const errorsOf = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

test('a title typed and reloaded inside the old debounce survives and reaches Barkpark', async ({page, browser, baseURL}) => {
  const errors = errorsOf(page)
  const title = `Reload title ${Date.now()}`
  const id = await newNote(page, title)
  await page.reload()
  await expect(page.getByTestId('title')).toHaveValue(title)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await onServer(browser, baseURL!, id, title, [])
  expect(errors).toEqual([])
})

test('a body typed and reloaded at once survives, and later saves still land', async ({page, browser, baseURL}) => {
  const errors = errorsOf(page)
  const title = `Reload body ${Date.now()}`
  const id = await newNote(page, title)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await typeAtEnd(page, 'First line.')
  await page.reload()
  await expect(canvas(page)).toContainText('First line.')
  await typeAtEnd(page, ' Second line.')
  await expect(status(page)).toHaveText('Saving…')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await onServer(browser, baseURL!, id, title, ['First line. Second line.'])
  expect(errors).toEqual([])
})

for (const wire of [
  {name: 'the instant the save leaves', latency: 0, wait: 0},
  {name: 'while the save is on a slow wire', latency: 1500, wait: 1000},
]) {
  test(`a reload ${wire.name}: Barkpark has it, the stale rev heals, saves keep landing`, async ({page, browser, baseURL}) => {
    const errors = errorsOf(page)
    const title = `Reload ${wire.name} ${Date.now()}`
    const id = await newNote(page, title)
    await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
    const cdp = await page.context().newCDPSession(page)
    if (wire.latency) await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: wire.latency, downloadThroughput: 50_000, uploadThroughput: 50_000})
    const save = page.waitForRequest((r) => r.method() === 'POST' && !!r.postData()?.includes('Sent mid-save.'))
    await typeAtEnd(page, 'Sent mid-save.')
    await save
    await page.waitForTimeout(wire.wait)
    await page.reload()
    if (wire.latency) await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1})
    await expect(canvas(page)).toContainText('Sent mid-save.')
    await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
    await typeAtEnd(page, ' Then this.')
    await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
    await onServer(browser, baseURL!, id, title, ['Sent mid-save. Then this.'])
    expect(errors).toEqual([])
  })
}

test('two tabs on one note: each sees the other and both edits reach Barkpark', async ({page, context, browser, baseURL}) => {
  const errors = errorsOf(page)
  const title = `Two tabs ${Date.now()}`
  const id = await newNote(page, title)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await typeAtEnd(page, 'From tab one.')
  await leave(page)
  const two = await context.newPage()
  errors.push(...errorsOf(two))
  await two.goto(`/?n=${id}`)
  await expect(canvas(two)).toContainText('From tab one.')
  await leave(page)
  await typeAtEnd(two, ' From tab two.')
  await leave(two)
  await expect(canvas(page)).toContainText('From tab one. From tab two.')
  await typeAtEnd(page, ' Back in one.')
  await leave(page)
  const all = 'From tab one. From tab two. Back in one.'
  await expect(canvas(two)).toContainText(all)
  for (const p of [page, two]) await expect(status(p)).toHaveText('Saved', {timeout: 15_000})
  await onServer(browser, baseURL!, id, title, [all])
  expect(errors).toEqual([])
})

type Pm = {state: {doc: {child: (i: number) => {nodeSize: number}}}; commands: {setTextSelection: (r: {from: number; to: number}) => void}; view: {focus: () => void}}

const typeThenLeaveInOneTask = (page: Page, text: string, after: string) =>
  page.evaluate(
    ([text, after]) => {
      const el = document.querySelector('[data-testid=canvas]') as HTMLElement & {blocks: unknown}
      const ed = (el.querySelector('[contenteditable="true"]') as HTMLElement & {editor: Pm}).editor
      const end = ed.state.doc.child(0).nodeSize - 1
      ed.view.focus()
      ed.commands.setTextSelection({from: end, to: end})
      document.execCommand('insertText', false, text)
      document.querySelector<HTMLTextAreaElement>('[data-testid=title]')!.focus()
      if (after === 'pagehide') dispatchEvent(new Event('pagehide'))
      else new BroadcastChannel('barkever').postMessage({kind: 'remote', ids: [after]})
      return JSON.stringify(el.blocks).includes(text.trim())
    },
    [text, after],
  )

async function twoBlockNote(page: Page, title: string) {
  const id = await newNote(page, title)
  await expect(canvas(page).locator('[contenteditable="true"]')).toBeAttached()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Mine.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Theirs.')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  return id
}

test('leaving the page in the same breath as typing commits what was typed', async ({page}) => {
  const errors = errorsOf(page)
  const title = `Pagehide in the gap ${Date.now()}`
  await twoBlockNote(page, title)
  expect(await typeThenLeaveInOneTask(page, ' Typed then gone.', 'pagehide'), 'committed on pagehide').toBe(true)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await page.reload()
  await expect(canvas(page)).toContainText('Mine. Typed then gone.')
  expect(errors).toEqual([])
})

test('a remote change landing right after I type, with the cursor already in the title, keeps the body I typed', async ({page}) => {
  const errors = errorsOf(page)
  const title = `Remote in the gap ${Date.now()}`
  const id = await twoBlockNote(page, title)
  await page.evaluate(async (id) => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open(name)
      r.onsuccess = () => ok(r.result)
    })
    const tx = db.transaction('notes', 'readwrite')
    const store = tx.objectStore('notes')
    const get = store.get(id)
    get.onsuccess = () => {
      const note = get.result
      note.body.blocks[0] = {...note.body.blocks[0], content: [{type: 'text', value: 'Mine, edited elsewhere.'}]}
      store.put({...note, _gen: (note._gen ?? 0) + 1})
    }
    await new Promise((ok) => (tx.oncomplete = ok))
    db.close()
  }, id)
  await typeThenLeaveInOneTask(page, ' Typed in the gap.', id)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await page.reload()
  await expect(page.getByTestId('title')).toHaveValue(title)
  await page.getByTestId('conflict').locator('summary').first().click()
  const kept = await page.locator('main.editor').innerText()
  expect(kept, 'what I typed survives').toContain('Mine. Typed in the gap.')
  expect(kept, 'the other version survives').toContain('Mine, edited elsewhere.')
  expect(errors).toEqual([])
})

const ROUNDS = Number(process.env.RELOAD_ROUNDS ?? 6)

const typeBothAndReload = (page: Page, n: number) =>
  page
    .evaluate(async (n) => {
      const editable = () => document.querySelector('[data-testid=canvas] [contenteditable="true"]') as (HTMLElement & {editor?: Pm}) | null
      type Pm = {state: {doc: {forEach: (f: (node: {type: {name: string}; nodeSize: number}, at: number) => void) => void}}; commands: {setTextSelection: (r: {from: number; to: number}) => void}; view: {focus: () => void}}
      for (let i = 0; i < 400 && !editable()?.editor; i++) await new Promise((r) => setTimeout(r, 5))
      const ed = editable()!.editor!
      let end = -1
      ed.state.doc.forEach((node, at) => void (end < 0 && node.type.name === 'paragraph' && (end = at + node.nodeSize - 1)))
      ed.view.focus()
      ed.commands.setTextSelection({from: end, to: end})
      document.execCommand('insertText', false, ` RL${n}`)
      const t = document.querySelector<HTMLTextAreaElement>('[data-testid=title]')!
      t.focus()
      t.setSelectionRange(t.value.length, t.value.length)
      document.execCommand('insertText', false, ` T${n}`)
      location.reload()
    }, n)
    .catch(() => undefined)

test(`stress: body and title typed in one breath right before a reload both survive, ${ROUNDS} rounds, cold and warm`, async ({page, browser, baseURL}) => {
  test.setTimeout(60_000 + ROUNDS * 15_000)
  const errors = errorsOf(page)
  const title = `Reload stress ${Date.now()}`
  const id = await newNote(page, title)
  await expect(canvas(page).locator('[contenteditable="true"]')).toBeAttached()
  await page.keyboard.press('Enter')
  await expect(canvas(page).locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('Body.')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  const cdp = await page.context().newCDPSession(page)
  let body = 'Body.'
  let titled = title
  for (let n = 1; n <= ROUNDS; n++) {
    if (n % 3 === 0) await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 400, downloadThroughput: 200_000, uploadThroughput: 200_000})
    if (n % 2) await page.goto(`/?n=${id}`)
    await typeBothAndReload(page, n)
    body += ` RL${n}`
    titled += ` T${n}`
    await expect(page.getByTestId('title')).toHaveValue(titled, {timeout: 15_000})
    await expect(canvas(page), `round ${n}: the body typed before the reload`).toContainText(body, {timeout: 15_000})
    await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1})
  }
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 15_000})
  await onServer(browser, baseURL!, id, titled, [body])
  expect(errors).toEqual([])
})

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
