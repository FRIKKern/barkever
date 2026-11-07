import {expect, test, type Page} from '@playwright/test'
import {canvas, cleanup, errorsOf, newNote, status, typeAtEnd} from './note'

test.afterAll(cleanup)

type Planted = Window & {breakWrites?: boolean}

const SLOW_READ_MS = 3000

const slowOutboxReads = (page: Page, ms: number) =>
  page.addInitScript((wait) => {
    const later = window.setTimeout
    const real = IDBObjectStore.prototype.getAllKeys
    IDBObjectStore.prototype.getAllKeys = function (this: IDBObjectStore, ...a: Parameters<typeof real>) {
      const req = real.apply(this, a)
      if (this.name !== 'outbox') return req
      const add = req.addEventListener.bind(req)
      req.addEventListener = ((type: string, fn: (e: Event) => void, o?: boolean) => add(type, type === 'success' ? (e: Event) => later(() => fn(e), wait) : fn, o)) as typeof req.addEventListener
      return req
    }
  }, ms)

const abortingOutboxWrites = (page: Page) =>
  page.addInitScript(() => {
    const real = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...a: Parameters<typeof real>) {
      const req = real.apply(this, a)
      if ((window as Planted).breakWrites && this.name === 'outbox') this.transaction!.abort()
      return req
    }
  })

const noPosts = (page: Page) => page.route('**/*', (r) => (r.request().method() === 'POST' ? r.abort() : r.fallback()))

const outboxHolds = (page: Page, id: string) =>
  page.evaluate(async (note) => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
    const d = await new Promise<IDBDatabase>((ok) => (indexedDB.open(name).onsuccess = (e) => ok((e.target as IDBOpenDBRequest).result)))
    const found = await new Promise<unknown>((ok) => (d.transaction('outbox').objectStore('outbox').get(note).onsuccess = (e) => ok((e.target as IDBRequest).result)))
    d.close()
    return found !== undefined
  }, id)

const warnings = (page: Page) => {
  const seen: string[] = []
  page.on('dialog', (d) => {
    seen.push(d.message())
    void d.dismiss()
  })
  return seen
}

test('sign-out warns about a queued edit even before the first outbox read lands, and staying keeps the edit', async ({page}) => {
  const errors = errorsOf(page)
  const seen = warnings(page)
  const id = await newNote(page, `Sign out at once ${Date.now()}`)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await noPosts(page)
  await typeAtEnd(page, 'Queued words.')
  await expect.poll(() => outboxHolds(page, id), {timeout: 10_000}).toBe(true)
  await slowOutboxReads(page, SLOW_READ_MS)
  await page.reload()
  await page.getByTestId('sign-out').click()
  await expect.poll(() => seen, {timeout: SLOW_READ_MS * 3}).toEqual(['1 change has not reached Barkpark yet. Sign out and lose it?'])
  expect(new URL(page.url()).pathname).toBe('/')
  expect(await outboxHolds(page, id)).toBe(true)
  await expect(canvas(page)).toContainText('Queued words.')
  expect(errors).toEqual([])
})

test('a write that fails says so on the note, with no unhandled rejection; sign-out warns; a reload brings back every word', async ({page}) => {
  const errors = errorsOf(page)
  const seen = warnings(page)
  await abortingOutboxWrites(page)
  await newNote(page, `Broken disk ${Date.now()}`)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await page.evaluate(() => void ((window as Planted).breakWrites = true))
  await page.getByTestId('title').fill('Title on a broken disk')
  await expect(status(page)).toHaveText('Couldn’t save on this device')
  await typeAtEnd(page, 'Body on a broken disk.')
  await expect(status(page)).toHaveText('Couldn’t save on this device')
  await page.getByTestId('sign-out').click()
  await expect.poll(() => seen).toEqual(['1 change has not reached Barkpark yet. Sign out and lose it?'])
  expect(errors).toEqual([])
  await page.evaluate(() => void ((window as Planted).breakWrites = false))
  await typeAtEnd(page, ' Healed.')
  await expect(canvas(page)).toContainText('Body on a broken disk. Healed.')
  await expect(status(page)).toHaveText('Couldn’t save on this device')
  await page.reload()
  await expect(status(page)).toHaveText('Saved', {timeout: 30_000})
  await expect(page.getByTestId('title')).toHaveValue('Title on a broken disk', {timeout: 15_000})
  await expect(canvas(page)).toContainText('Body on a broken disk. Healed.')
  expect(errors).toEqual([])
})
