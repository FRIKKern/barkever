import {expect, test, type Page} from '@playwright/test'
import {ORIGIN, build, serve, stop} from './own-server'
import {DATASET} from './fixtures-cleanup'
import {HISTORY, HISTORY_EVENTS, dropNote, ensureHistory, noteText} from './history'
import {clickCaret} from './caret'

test.describe.configure({mode: 'serial', timeout: 300_000})

const NOTE = `probe-${DATASET}`

test.beforeAll(async () => {
  test.setTimeout(300_000)
  await ensureHistory(NOTE)
  build('history')
  await serve('history', {dataset: HISTORY})
})
test.afterAll(async () => {
  await stop()
  await dropNote(NOTE)
})
const BUDGET_MS = 1000

const canvas = (page: Page) => page.getByTestId('canvas')

async function open(page: Page) {
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: sitemap', {timeout: 30_000})
  await expect(canvas(page).locator('[contenteditable="true"] > [data-bp-id]').first()).toBeAttached()
}

async function caretAtEnd(page: Page) {
  const last = canvas(page).locator('[contenteditable="true"] > [data-bp-id]').last()
  const box = (await last.boundingBox())!
  await clickCaret(last, {x: box.width - 2, y: box.height / 2})
  await page.keyboard.press('End')
}

async function firstSaveAfterReload(page: Page, beforeReload: () => Promise<void>): Promise<number> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${ORIGIN}/?n=${NOTE}`)
  await open(page)
  await caretAtEnd(page)
  await page.keyboard.insertText(` Before ${Date.now()}.`)
  await expect(page.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
  await expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 15_000})
  await beforeReload()
  await page.reload()
  await open(page)
  const mark = `After ${Date.now()}.`
  await caretAtEnd(page)
  const t0 = performance.now()
  await page.keyboard.insertText(` ${mark}`)
  await expect.poll(() => noteText(NOTE), {timeout: 60_000, intervals: [25]}).toContain(mark)
  const ms = Math.round(performance.now() - t0)
  test.info().annotations.push({type: 'first save after reload', description: `${ms} ms, ${HISTORY}`})
  console.log(`first save after reload: ${ms} ms (${HISTORY}, ${HISTORY_EVENTS}+ events)`)
  expect(errors).toEqual([])
  return ms
}

const rewindTo = (page: Page, cursor: number) =>
  page.evaluate(async (cursor) => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open(name)
      r.onsuccess = () => ok(r.result)
    })
    const tx = db.transaction('meta', 'readwrite')
    tx.objectStore('meta').put(cursor, 'cursor')
    tx.objectStore('meta').put([], 'seen')
    await new Promise((ok) => (tx.oncomplete = ok))
    db.close()
  }, cursor)

test(`with ${HISTORY_EVENTS} events of history, a save typed right after a reload reaches Barkpark in under ${BUDGET_MS} ms`, async ({context}) => {
  const page = await context.newPage()
  expect(await firstSaveAfterReload(page, () => page.waitForTimeout(500))).toBeLessThan(BUDGET_MS)
})

test(`a replica last in sync before all ${HISTORY_EVENTS} events still saves in under ${BUDGET_MS} ms while it replays them`, async ({context}) => {
  const page = await context.newPage()
  const replays = page.waitForRequest((r) => r.url().endsWith('/api/listen?since=0'))
  expect(await firstSaveAfterReload(page, () => rewindTo(page, 0))).toBeLessThan(BUDGET_MS)
  await replays
})
