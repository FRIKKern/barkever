import {expect, test, type Browser, type Page} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'
import {SESSION_FILE} from './account'
import {blockText, type Block} from '../src/lib/model.ts'

type ServerNote = {_id: string; _rev: string; title?: string; body?: {blocks: Block[]}; conflicts?: {title?: string; body?: {blocks: Block[]}}[]}

const created: string[] = []
test.afterAll(() => deleteNotes(created))

const canvas = (page: Page) => page.getByTestId('canvas')
const status = (page: Page) => page.getByTestId('save-status')
const synced = (page: Page) => expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 15_000})
const leave = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

async function device(browser: Browser, baseURL: string) {
  const context = await browser.newContext({baseURL, storageState: SESSION_FILE, viewport: {width: 1440, height: 900}})
  const page = await context.newPage()
  return page
}

async function newNote(page: Page, title: string, body: string) {
  await page.goto('/')
  await expect(page.getByTestId('new-note')).toBeEnabled()
  await page.keyboard.press('n')
  await expect(page.getByTestId('title')).toBeFocused()
  const id = new URL(page.url()).searchParams.get('n')!
  created.push(id)
  await page.keyboard.type(title)
  await expect(canvas(page).locator('[contenteditable="true"]')).toBeAttached()
  await page.keyboard.press('Enter')
  await page.keyboard.type(body)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  return id
}

async function typeAtEndOf(page: Page, index: number, text: string) {
  const block = canvas(page).locator('[contenteditable="true"] > [data-bp-id]').nth(index)
  const box = (await block.boundingBox())!
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2)
  await page.keyboard.press('End')
  await page.keyboard.type(text)
}

async function serverNote(id: string): Promise<ServerNote | undefined> {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=drafts&filter[_id][in]=${id},drafts.${id}`)
  return ((await res.json()) as {result: {documents: ServerNote[]}}).result.documents[0]
}

async function serverRows(id: string): Promise<string[]> {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=raw&filter[_id][in]=${id},drafts.${id}`)
  return ((await res.json()) as {result: {documents: {_id: string}[]}}).result.documents.map((d) => d._id)
}

const everything = (n: ServerNote | undefined) => (n ? [n, ...(n.conflicts ?? [])].flatMap((v) => [v.title ?? '', ...(v.body?.blocks ?? []).map(blockText)]).join(' | ') : '')

const errorsOf = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

test('bug 1: a focused editor that never saw the merged text keeps every version when it types again', async ({browser, baseURL}) => {
  const a = await device(browser, baseURL!)
  const b = await device(browser, baseURL!)
  const errors = [...errorsOf(a), ...errorsOf(b)]
  const id = await newNote(a, `Focused overwrite ${Date.now()}`, 'Base.')
  await b.goto(`/?n=${id}`)
  await expect(canvas(b)).toContainText('Base.', {timeout: 15_000})

  await b.context().setOffline(true)
  await typeAtEndOf(b, 0, ' OFF-B.')
  await leave(b)
  await typeAtEndOf(a, 0, ' A-one.')
  await expect(status(a)).toHaveText('Saved', {timeout: 15_000})

  await b.context().setOffline(false)
  await synced(b)
  await expect.poll(async () => everything(await serverNote(id)), {timeout: 15_000}).toContain('OFF-B.')
  await a.waitForTimeout(500)
  await a.keyboard.type(' A-two.')
  await leave(a)
  await expect(status(a)).toHaveText('Saved', {timeout: 15_000})
  await synced(a)

  const note = await serverNote(id)
  for (const t of ['OFF-B.', 'A-one.', 'A-two.']) expect(everything(note), `${t} survives in the note or a kept version`).toContain(t)
  expect(errors).toEqual([])
  await Promise.all([a.context().close(), b.context().close()])
})

test('bug 3: a change that lands while the editor is still loading shows up, and the next edit keeps it', async ({browser, baseURL}) => {
  const one = await device(browser, baseURL!)
  const errors = errorsOf(one)
  const id = await newNote(one, `Loading race ${Date.now()}`, 'Base.')
  await leave(one)
  const two = await one.context().newPage()
  errors.push(...errorsOf(two))
  await two.route('**/editor-assets/**', async (r) => {
    await new Promise((ok) => setTimeout(ok, 2500))
    await r.continue()
  })
  await two.goto(`/?n=${id}`)
  await expect(two.getByTestId('title')).toHaveValue(/Loading race/)
  await typeAtEndOf(one, 0, ' From tab one.')
  await leave(one)
  await expect(status(one)).toHaveText('Saved', {timeout: 15_000})
  await expect(canvas(two).locator('[contenteditable="true"]')).toBeAttached({timeout: 15_000})
  await expect(canvas(two)).toContainText('From tab one.')
  await typeAtEndOf(two, 0, ' Tab two.')
  await leave(two)
  await expect(status(two)).toHaveText('Saved', {timeout: 15_000})
  await expect(canvas(one)).toContainText('Base. From tab one. Tab two.')
  await synced(one)
  expect(blockText((await serverNote(id))!.body!.blocks[0])).toBe('Base. From tab one. Tab two.')
  expect(errors).toEqual([])
  await one.context().close()
})

test('bug 2: a published note edited online deletes, both rows go, and Barkpark keeps no copy', async ({browser, baseURL}) => {
  const id = `e2e-published-${Date.now()}`
  created.push(id)
  const seed = await barkpark(`/v1/data/mutate/${DATASET}`, {
    method: 'POST',
    body: JSON.stringify({mutations: [{createOrReplace: {_id: id, _type: 'note', title: 'Published, then edited online', notebook: {_type: 'reference', _ref: 'fx-nb-inbox'}, tags: [], links: [], body: {blocks: [{id: `${id}-p0`, type: 'paragraph', content: [{type: 'text', value: 'Published.'}]}]}}}, {publish: {id, type: 'note'}}]}),
  })
  expect(seed.ok).toBe(true)
  const page = await device(browser, baseURL!)
  const errors = errorsOf(page)
  await page.goto(`/?n=${id}`)
  await expect(page.getByTestId('title')).toHaveValue('Published, then edited online', {timeout: 15_000})
  await page.getByTestId('title').fill('Published, then edited online, now a draft too')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await expect.poll(async () => (await serverRows(id)).sort(), {timeout: 15_000}).toEqual([`drafts.${id}`, id])
  await synced(page)

  await page.getByTestId('delete-note').click()
  await expect(page.locator(`[data-testid=note-row][data-note-id="${id}"]`)).toHaveCount(0)
  await synced(page)
  await expect.poll(() => serverRows(id), {timeout: 10_000}).toEqual([])
  await expect(page.getByTestId('sync-stuck')).toHaveCount(0)
  expect(errors).toEqual([])
  await page.context().close()
})

test('bug 2: an entry Barkpark refuses never blocks the others, shows as stuck, logs, and retries with backoff', async ({browser, baseURL}) => {
  const page = await device(browser, baseURL!)
  const warnings: string[] = []
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()))
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible()
  const bad = `e2e-refused-${Date.now()}`
  await page.evaluate(async (bad) => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open(name)
      r.onsuccess = () => ok(r.result)
    })
    const tx = db.transaction(['notes', 'rows', 'outbox'], 'readwrite')
    tx.objectStore('notes').put({_id: bad, _type: 'note', title: 'too long for Barkpark '.repeat(5000), notebook: {_type: 'reference', _ref: 'fx-nb-inbox'}, tags: [], links: [], body: {blocks: []}})
    tx.objectStore('rows').put({id: bad})
    tx.objectStore('outbox').put({id: bad, base: null, v: 1, at: Date.now()})
    await new Promise((ok) => (tx.oncomplete = ok))
    db.close()
  }, bad)
  const good = await newNote(page, `Lands beside a refused one ${Date.now()}`, 'Good.')
  await expect.poll(async () => blockText((await serverNote(good))?.body?.blocks[0] ?? {id: '', type: 'paragraph'}), {timeout: 15_000}).toBe('Good.')
  await expect(page.getByTestId('sync-stuck')).toContainText('1 not accepted')
  await expect(page.getByTestId('sync-stuck')).toHaveAttribute('title', new RegExp(`${bad}: 422`))
  await expect.poll(() => warnings.filter((w) => w.includes(bad)).length, {timeout: 15_000}).toBeGreaterThanOrEqual(2)
  expect(warnings.find((w) => w.includes(bad))).toMatch(/did not reach Barkpark \(422 validation_failed\); attempt 1, next in 2 s/)
  expect(await serverNote(bad)).toBeUndefined()
  await page.context().close()
})

test('Enter in the title before the editor has loaded moves the cursor into the body once it loads', async ({page}) => {
  await page.route('**/editor-assets/**', async (r) => {
    await new Promise((ok) => setTimeout(ok, 1500))
    await r.continue()
  })
  await page.goto('/')
  await expect(page.getByTestId('new-note')).toBeEnabled()
  await page.keyboard.press('n')
  await expect(page.getByTestId('title')).toBeFocused()
  created.push(new URL(page.url()).searchParams.get('n')!)
  await page.keyboard.type('Enter early')
  await expect(canvas(page)).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(canvas(page).locator('[contenteditable="true"]')).toBeAttached({timeout: 10_000})
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid=canvas]'))).toBe(true)
})

test('when no tab holds the sync lock, sync takes it back by itself and keeps saving', async ({page}) => {
  const id = await newNote(page, `Lock lost ${Date.now()}`, 'Before.')
  const lock = () => page.evaluate(async () => (await navigator.locks.query()).held?.find((l) => l.name?.endsWith('-sync'))?.name ?? null)
  const name = await lock()
  expect(name).toBeTruthy()
  await page.evaluate((name) => navigator.locks.request(name, {steal: true}, async () => {}), name!)
  await expect.poll(lock, {timeout: 10_000}).toBe(name)
  await typeAtEndOf(page, 0, ' After.')
  await leave(page)
  await expect.poll(async () => blockText((await serverNote(id))?.body?.blocks[0] ?? {id: '', type: 'paragraph'}), {timeout: 15_000}).toBe('Before. After.')
})
