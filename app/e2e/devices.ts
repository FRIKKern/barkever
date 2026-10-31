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
