import {expect, test, type Page} from '@playwright/test'
import {ORIGIN, build, serve, stop} from './own-server'
import {ORGANIZE, seedProbe, serverNote} from './probe'

test.describe.configure({mode: 'serial', timeout: 240_000})

test.beforeAll(async () => {
  test.setTimeout(400_000)
  await seedProbe(ORGANIZE)
  build('p3g-j04')
  await serve('p3g-j04', {dataset: ORGANIZE})
})
test.afterAll(stop)

const NOTE = 'fx-note-02'
const TITLE = 'Harbor redesign: wireframes'
const TAG = 'p3g-organized'

const side = (page: Page, testid: string, text: string) => page.getByTestId(testid).filter({hasText: text})
const row = (page: Page, text: string) => page.getByTestId('note-row').filter({hasText: text})
const count = (page: Page, notebook: string) => side(page, 'side-notebook', notebook).locator('.n')
const title = (page: Page) => page.getByTestId('title')
const params = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)
const onServer = () => serverNote(ORGANIZE, NOTE)

async function opened(page: Page, text: string) {
  await expect(title(page)).toHaveValue(text)
  await page.waitForTimeout(1_000)
}

test('J04 organize: notebooks with stacks, tags, shortcuts and recents, each one click from the sidebar; moves and tags sync like any edit', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  await page.goto(`${ORIGIN}/`)
  await expect(page.getByTestId('side-all')).toContainText('50', {timeout: 60_000})

  await side(page, 'side-notebook', 'Work').click()
  expect(params(page)).toEqual({nb: 'fx-nb-work'})
  const inWork = new Set(await page.getByTestId('note-notebook').evaluateAll((els) => els.map((e) => e.getAttribute('data-notebook'))))
  expect(inWork).toEqual(new Set(['Work', 'Projects', 'Meetings']))

  await side(page, 'side-notebook', 'Projects').click()
  await row(page, TITLE).click()
  await opened(page, TITLE)
  const homeBefore = Number(await count(page, 'Home').textContent())
  await page.getByTestId('notebook-pick').selectOption('fx-nb-home')
  await expect(row(page, TITLE)).toHaveCount(0)
  await expect(count(page, 'Home')).toHaveText(String(homeBefore + 1))
  await expect(page.locator('.crumb')).toHaveText('Home')
  await expect.poll(async () => (await onServer()).notebook?._ref, {timeout: 20_000}).toBe('fx-nb-home')

  await page.getByTestId('tag-add').fill(TAG)
  await page.getByTestId('tag-add').press('Enter')
  await expect(page.getByTestId('note-tag')).toHaveText([/#harbor/, /#design/, new RegExp(`#${TAG}`)])
  await page.getByRole('button', {name: 'Remove tag design'}).click()
  await expect(page.getByTestId('note-tag')).toHaveText([/#harbor/, new RegExp(`#${TAG}`)])
  await expect.poll(async () => (await onServer()).tags, {timeout: 20_000}).toEqual(['harbor', TAG])

  await page.getByTestId('star').click()
  await expect(side(page, 'side-shortcut', TITLE)).toHaveCount(1)
  await page.screenshot({path: test.info().outputPath('j04-organize-dark.png')})

  await side(page, 'side-tag', `#${TAG}`).click()
  expect(params(page)).toEqual({tag: TAG})
  await expect(page.getByTestId('note-row')).toHaveCount(1)
  await expect(row(page, TITLE)).toHaveCount(1)

  await side(page, 'side-notebook', 'Home').click()
  await expect(row(page, TITLE)).toHaveCount(1)
  await row(page, 'Recipes: sourdough').click()
  await opened(page, 'Recipes: sourdough')
  await expect(page.getByTestId('side-recent').first()).toHaveText('Recipes: sourdough')
  await expect(page.getByTestId('side-recent').nth(1)).toHaveText(TITLE)

  await side(page, 'side-recent', TITLE).click()
  await opened(page, TITLE)
  await page.getByTestId('side-all').click()
  await side(page, 'side-shortcut', TITLE).click()
  await opened(page, TITLE)
  await expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 20_000})
  await page.waitForTimeout(1_500)

  await page.reload()
  await expect(title(page)).toHaveValue(TITLE)
  await expect(page.locator('.crumb')).toHaveText('Home')
  await expect(page.getByTestId('note-tag')).toHaveText([/#harbor/, new RegExp(`#${TAG}`)])
  await expect(side(page, 'side-shortcut', TITLE)).toHaveCount(1)
  await expect(page.getByTestId('side-recent').first()).toHaveText(TITLE)
  await expect(side(page, 'side-tag', `#${TAG}`)).toHaveCount(1)

  await page.getByTestId('star').click()
  await expect(side(page, 'side-shortcut', TITLE)).toHaveCount(0)
  await page.getByTestId('note-tag').filter({hasText: TAG}).getByRole('button').click()
  await expect(side(page, 'side-tag', `#${TAG}`)).toHaveCount(0)
  await expect.poll(async () => (await onServer()).tags, {timeout: 20_000}).toEqual(['harbor'])
  expect(errors).toEqual([])
})
