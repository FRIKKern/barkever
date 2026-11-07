import {expect, test, type Page} from '@playwright/test'
import {ORIGIN, build, serve, stop} from './own-server'
import {FIND, FIND_NOTES, seedProbe} from './probe'

test.describe.configure({mode: 'serial', timeout: 300_000})

test.beforeAll(async () => {
  test.setTimeout(600_000)
  await seedProbe(FIND, FIND_NOTES)
  build('p3g-j03')
  await serve('p3g-j03', {dataset: FIND})
})
test.afterAll(stop)

const BUDGET_MS = 150
const OPEN_QUERIES = ['a', 'st', 'e', 'harbor', 'sitemap', 'wierframes', 'stone', 'tarn']
const QUERIES = ['a', 'st', 'harbor', 'sitemap', 'sourdough', 'hydration', 'hyrdation', 'wierframes', 'garlik', 'carousel', 'lighthouse risk', 'quarry', 'bulk-alpha', 'brai', 'tarn', 'stone greys', 'xyzzy', 'calm navigation', 'weekly', 'dentist', 'packing', 'harbor sitemap']

const search = (page: Page) => page.getByTestId('search')
const rows = (page: Page) => page.getByTestId('note-row')
const params = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)

async function synced(page: Page) {
  await page.goto(`${ORIGIN}/`)
  await expect(page.getByTestId('side-all')).toContainText(String(FIND_NOTES), {timeout: 240_000})
}

const firstResults = (page: Page, q: string) =>
  page.evaluate(
    (q) =>
      new Promise<number>((done, fail) => {
        const input = document.querySelector<HTMLInputElement>('[data-testid="search"]')!
        const list = document.querySelector('.list')!
        let t0 = 0
        const seen = new MutationObserver(() => {
          seen.disconnect()
          requestAnimationFrame(() => setTimeout(() => done(performance.now() - t0)))
        })
        seen.observe(list.querySelector('.rows')!, {childList: true, subtree: true, characterData: true})
        setTimeout(() => (seen.disconnect(), fail(new Error(`no results painted for "${q}"`))), 5000)
        input.focus()
        t0 = performance.now()
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, q)
        input.dispatchEvent(new Event('input', {bubbles: true}))
      }),
    q,
  )

test('J03 find: words in the title or only in the body, typos too, ranked in the list, and offline', async ({page, context}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  await synced(page)

  await search(page).fill('sitemap')
  await expect(page).toHaveURL(/q=sitemap/)
  await expect(page.getByTestId('list-head')).toContainText('Search')
  await expect(rows(page).first()).toContainText('Harbor redesign: sitemap')
  await expect(rows(page).first().locator('mark').first()).toHaveText(/sitemap/i)

  await search(page).fill('hydration')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Recipes: sourdough')
  await expect(rows(page).first().locator('.row-snip mark')).toHaveText('hydration')

  await search(page).fill('hyrdation')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).first()).toContainText('Recipes: sourdough')
  await expect(rows(page).first().locator('.row-snip mark')).toHaveText('hydration')

  await search(page).fill('lighthouse risk')
  await expect(rows(page).first()).toContainText('Lighthouse app: risks')

  await search(page).fill('xyzzy')
  await expect(page.locator('.rows .empty')).toHaveText('Nothing matches “xyzzy”.')

  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toBeVisible()
  await search(page).fill('wierframes')
  await expect(rows(page).first()).toContainText('Harbor redesign: wireframes')
  await rows(page).first().click()
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: wireframes')
  expect(params(page)).toEqual({q: 'wierframes', n: 'fx-note-02'})
  await context.setOffline(false)

  await page.goBack()
  await expect(page.getByTestId('title')).toHaveCount(0)
  await expect(search(page)).toHaveValue('wierframes')
  await search(page).press('Escape')
  await expect(page).not.toHaveURL(/q=/)
  await expect(page.getByTestId('list-head')).toContainText(`${FIND_NOTES} notes`)

  await search(page).fill('harbor')
  await expect(rows(page).first()).toContainText('Harbor')
  await page.screenshot({path: test.info().outputPath('j03-search-dark.png')})
  expect(errors).toEqual([])
})

async function timed(page: Page, queries: string[], what: string) {
  await firstResults(page, 'warm')
  const ms: Record<string, number> = {}
  for (const q of queries) {
    await firstResults(page, '')
    ms[q] = Math.round(await firstResults(page, q))
  }
  const sorted = Object.values(ms).sort((a, b) => a - b)
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  const line = `search first results at ${FIND_NOTES} notes, ${what}: p50 ${at(0.5)} ms, p95 ${at(0.95)} ms, max ${sorted.at(-1)} ms (${queries.length} queries) · ${Object.entries(ms).map(([q, t]) => `${q} ${t}`).join(' · ')}`
  console.log(line)
  test.info().annotations.push({type: 'J03 timing', description: line})
  return at(0.95)
}

test(`J03 speed: first results in under ${BUDGET_MS} ms at ${FIND_NOTES} notes, measured in the page`, async ({page}) => {
  await synced(page)
  expect(await timed(page, QUERIES, 'no note open')).toBeLessThan(BUDGET_MS)
})

test(`J03 speed with a note open: the list stays a window, the open note stays pinned, first results in under ${BUDGET_MS} ms`, async ({page}) => {
  await synced(page)
  await page.goto(`${ORIGIN}/?n=fx-note-03`)
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: content plan')
  expect(await timed(page, OPEN_QUERIES, 'note open')).toBeLessThan(BUDGET_MS)
  await firstResults(page, 'a')
  const open = page.locator('[data-testid="note-row"][data-note-id="fx-note-03"]')
  await expect(open).toHaveAttribute('aria-selected', 'true')
  expect(await rows(page).count()).toBeLessThanOrEqual(101)
})

test('J03: the pinned open note stays put while the list pages in', async ({page}) => {
  await synced(page)
  await page.goto(ORIGIN)
  await expect(rows(page).nth(99)).toBeAttached({timeout: 30_000})
  await rows(page).nth(99).scrollIntoViewIfNeeded()
  await expect.poll(() => rows(page).count(), {timeout: 15_000}).toBeGreaterThan(150)
  const far = (await rows(page).nth(150).getAttribute('data-note-id'))!
  await page.addInitScript((id) => {
    const tops = new Set<number>()
    Object.assign(window, {tops})
    const look = () => {
      const row = document.querySelector<HTMLElement>(`[data-testid="note-row"][data-note-id="${id}"]`)
      if (row) tops.add(row.offsetTop)
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  }, far)
  await page.goto(`${ORIGIN}/?n=${far}`)
  const open = page.locator(`[data-testid="note-row"][data-note-id="${far}"]`)
  await expect(open).toHaveAttribute('aria-selected', 'true', {timeout: 30_000})
  await open.scrollIntoViewIfNeeded()
  await expect.poll(() => rows(page).count(), {timeout: 15_000}).toBeGreaterThan(101)
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => [...(window as unknown as {tops: Set<number>}).tops])).toHaveLength(1)
  await expect(open).toHaveAttribute('aria-selected', 'true')
})

test('J01 at 5,000 notes: typing has no long task per key, and stays on this device', async ({page, context}) => {
  await page.addInitScript(() => {
    const long: number[] = []
    Object.assign(window, {long})
    new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push(e.duration))).observe({type: 'longtask'})
  })
  await synced(page)
  await page.goto(`${ORIGIN}/?n=fx-note-03`)
  await expect(page.getByTestId('canvas').locator('[contenteditable="true"]').first()).toBeAttached({timeout: 30_000})
  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toBeVisible({timeout: 15_000})
  await page.locator('body').click({position: {x: 1, y: 1}})
  await page.keyboard.press('n')
  await expect(page.getByTestId('title')).toBeFocused()
  await page.keyboard.type('Typing cost')
  await page.keyboard.press('Enter')
  const body = page.getByTestId('canvas').locator('[contenteditable="true"]').first()
  await expect(body).toBeFocused({timeout: 30_000})
  await page.waitForTimeout(1000)
  await page.evaluate(() => ((window as unknown as {long: number[]}).long.length = 0))
  const KEYS = 'Swap the cells before winter comes here.'
  await page.keyboard.type(KEYS, {delay: 80})
  const long = await page.evaluate(() => (window as unknown as {long: number[]}).long)
  expect(long.length, `long tasks over ${KEYS.length} keys: ${long.map(Math.round)}`).toBeLessThan(KEYS.length / 2)
})
