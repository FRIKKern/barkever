import {expect, test, type Page} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'

test.describe.configure({mode: 'serial', timeout: 150_000})

const TARGET = 'Tide gauge: spring check'
const RENAMED = 'Tide gauge: autumn check'
const SOURCE = 'Pier walk: what to check'
const created: string[] = []
test.afterAll(() => deleteNotes(created))

type Stored = Record<string, unknown> & {_id: string}

const opened = (page: Page) => new URL(page.url()).searchParams.get('n')
const links = (page: Page) => page.getByTestId('canvas').locator('[data-wikilink]')
const synced = (page: Page) => expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 30_000})
const shown = (page: Page) => links(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText))
const caretLink = (page: Page) => page.evaluate(() => (document.querySelector('bp-paper-canvas') as unknown as {state(): {wikilink: unknown}}).state().wikilink)

async function onServer(id: string): Promise<Stored | undefined> {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=drafts&limit=2&filter[_id][in]=${id},drafts.${id}`)
  const docs = ((await res.json()) as {result: {documents: Stored[]}}).result.documents
  return docs.find((d) => d._id.startsWith('drafts.')) ?? docs[0]
}

async function recreate(doc: Stored) {
  const {_rev, _updatedAt, _createdAt, ...content} = doc
  const res = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{createOrReplace: content}]})})
  expect(res.status).toBe(200)
}

async function newNote(page: Page, title: string) {
  const before = opened(page)
  await page.keyboard.press('ControlOrMeta+n')
  await expect(page.getByTestId('title')).toBeFocused()
  await expect.poll(() => opened(page)).not.toBe(before)
  created.push(opened(page)!)
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('canvas').locator('[contenteditable="true"]')).toBeFocused()
  return opened(page)!
}

async function leftOf(page: Page, text: string, steps: number) {
  const line = page.getByTestId('canvas').locator('p', {hasText: text})
  const box = (await line.boundingBox())!
  await line.click({position: {x: box.width - 2, y: box.height / 2}})
  for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowLeft')
}

async function followFrom(page: Page, from: string, to: string) {
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => opened(page)).toBe(to)
  await page.goBack()
  await expect.poll(() => opened(page)).toBe(from)
}

test('J05 live titles: a typed [[Title]] links, a rename repaints every link without writing the linking note, Mod+Enter inside or beside a link follows it, and a delete and a recreate mark and unmark it', async ({browser}) => {
  const context = await browser.newContext({storageState: test.info().project.use.storageState, colorScheme: 'dark'})
  const [page, other] = [await context.newPage(), await context.newPage()]
  const errors: string[] = []
  for (const p of [page, other]) p.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 30_000})

  const target = await newNote(page, TARGET)
  await page.keyboard.type('Read the gauge at low water.')
  await synced(page)
  const source = await newNote(page, SOURCE)
  await page.keyboard.type('First [[tide gau')
  await expect(page.locator('.bp-wikilink-item').first()).toContainText(TARGET)
  await page.keyboard.press('Enter')
  await page.keyboard.type('then the rest.')
  await page.keyboard.press('Enter')
  await page.keyboard.type(`Again [[${TARGET.toUpperCase()}]] here.`)
  await expect(links(page)).toHaveCount(2)
  await expect.poll(() => shown(page)).toEqual([TARGET, TARGET])
  await synced(page)
  await expect.poll(async () => JSON.stringify((await onServer(source))?.links), {timeout: 30_000}).toContain(target)
  const stored = JSON.stringify((await onServer(source))?.body)
  await leftOf(page, 'then the rest.', ' then the rest.'.length + 1)
  expect(await caretLink(page)).not.toBeNull()
  await followFrom(page, source, target)

  await other.goto(`/?n=${target}`)
  await expect(other.getByTestId('title')).toHaveValue(TARGET, {timeout: 30_000})
  await other.getByTestId('title').fill(RENAMED)
  await expect.poll(() => shown(page), {timeout: 15_000}).toEqual([RENAMED, RENAMED])
  await synced(other)
  await synced(page)
  expect(JSON.stringify((await onServer(source))?.body)).toBe(stored)
  await page.screenshot({path: test.info().outputPath('j05-live-title-dark-1440.png')})

  await leftOf(page, 'then the rest.', ' then the rest.'.length)
  expect(await caretLink(page)).toBeNull()
  await followFrom(page, source, target)
  await expect.poll(() => shown(page)).toEqual([RENAMED, RENAMED])

  const before = (await onServer(target))!
  await other.getByTestId('delete-note').click()
  await expect(links(page).first()).toHaveAttribute('data-missing', {timeout: 15_000})
  await expect(links(page).nth(1)).toHaveAttribute('data-missing')
  await expect.poll(() => shown(page)).toEqual([TARGET, TARGET])
  await links(page).first().hover()
  await expect(page.locator('.bp-link-preview__title')).toHaveText('Deleted note')
  await expect(page.locator('.bp-link-preview__open')).toBeHidden()
  await page.screenshot({path: test.info().outputPath('j05-live-missing-dark-1440.png'), animations: 'disabled'})
  await page.mouse.move(0, 0)
  await page.setViewportSize({width: 390, height: 844})
  await page.screenshot({path: test.info().outputPath('j05-live-missing-dark-390.png')})

  await recreate(before)
  await expect(links(page).first()).not.toHaveAttribute('data-missing', {timeout: 20_000})
  await expect.poll(() => shown(page)).toEqual([RENAMED, RENAMED])
  expect(JSON.stringify((await onServer(source))?.body)).toBe(stored)
  await page.screenshot({path: test.info().outputPath('j05-live-title-dark-390.png')})
  expect(errors).toEqual([])
  await context.close()
})
