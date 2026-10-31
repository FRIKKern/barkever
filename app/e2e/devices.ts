import {expect, type Browser, type Page} from '@playwright/test'
import {barkpark, DATASET} from './fixtures-cleanup'
import {anotherDevice} from './account'
import {blockText, type Block, type Conflict} from '../src/lib/model.ts'
import {clickCaret} from './caret'

export type ServerNote = {_id: string; _rev: string; title?: string; by?: string; body?: {blocks: Block[]}; conflicts?: Conflict[]}

export const created: string[] = []

export const canvas = (page: Page) => page.getByTestId('canvas')
export const status = (page: Page) => page.getByTestId('save-status')
export const synced = (page: Page) => expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 15_000})
export const leave = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

export async function device(browser: Browser, baseURL: string, colorScheme: 'light' | 'dark' = 'light') {
  const context = await browser.newContext({baseURL, storageState: anotherDevice(), viewport: {width: 1440, height: 900}, colorScheme})
  return context.newPage()
}

export async function newNote(page: Page, title: string, body: string) {
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

export async function typeAtEndOf(page: Page, index: number, text: string) {
  const block = canvas(page).locator('[contenteditable="true"] > [data-bp-id]').nth(index)
  const box = (await block.boundingBox())!
  await clickCaret(block, {x: box.width - 2, y: box.height / 2})
  await page.keyboard.press('End')
  await page.keyboard.type(text)
}

export async function serverNote(id: string): Promise<ServerNote | undefined> {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=drafts&filter[_id][in]=${id},drafts.${id}`)
  return ((await res.json()) as {result: {documents: ServerNote[]}}).result.documents[0]
}

export const everything = (n: ServerNote | undefined) => (n ? [n, ...(n.conflicts ?? [])].flatMap((v) => [v.title ?? '', ...(v.body?.blocks ?? []).map(blockText)]).join(' | ') : '')

export const errorsOf = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

export const deviceOf = (page: Page) => page.evaluate(() => Object.entries(localStorage).find(([k]) => k.endsWith('-device'))?.[1])

export const replicaHolds = (page: Page, id: string, text: string) =>
  expect
    .poll(
      () =>
        page.evaluate(async ([id, text]) => {
          for (const {name} of await indexedDB.databases()) {
            const open = indexedDB.open(name!)
            const store = await new Promise<IDBDatabase>((done, fail) => ((open.onsuccess = () => done(open.result)), (open.onerror = () => fail(open.error))))
            const note = store.objectStoreNames.contains('notes') ? await new Promise((done) => (store.transaction('notes').objectStore('notes').get(id).onsuccess = (e) => done((e.target as IDBRequest).result))) : undefined
            store.close()
            if (note && JSON.stringify(note).includes(text)) return true
          }
          return false
        }, [id, text]),
      {timeout: 30_000},
    )
    .toBe(true)

export async function otherDeviceTypes(browser: Browser, baseURL: string, id: string, block: number, text: string) {
  const other = await device(browser, baseURL)
  await other.goto(`/?n=${id}`)
  await expect(canvas(other).locator('[contenteditable="true"] > [data-bp-id]').nth(block)).toBeVisible({timeout: 20_000})
  await typeAtEndOf(other, block, text)
  await leave(other)
  await synced(other)
  await other.context().close()
}

export async function keepsOtherDevicesWords(page: Page, browser: Browser, baseURL: string, id: string, block: number, write: () => Promise<unknown>) {
  const words = `OTHER-DEVICE-${Date.now()}`
  await otherDeviceTypes(browser, baseURL, id, block, ` ${words}.`)
  await replicaHolds(page, id, words)
  await write()
  await synced(page)
  await expect.poll(async () => everything(await serverNote(id)), {timeout: 15_000, message: "the other device's words survive my write, in the note or a version"}).toContain(words)
}
