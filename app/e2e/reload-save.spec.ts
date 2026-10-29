import {expect, test, type Browser, type Page} from '@playwright/test'
import {deleteNotes} from './fixtures-cleanup'
import {SESSION_FILE} from './account'

const created: string[] = []
test.afterAll(() => deleteNotes(created))

const status = (page: Page) => page.getByTestId('save-status')
const canvas = (page: Page) => page.getByTestId('canvas')

async function newNote(page: Page, title: string) {
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible()
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
  if (box?.height) await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2)
  else await editable.focus()
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
