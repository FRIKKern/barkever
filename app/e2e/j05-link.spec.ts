import {expect, test, type Page} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'

test.describe.configure({mode: 'serial', timeout: 120_000})

const TARGET = 'Lighthouse buoy: battery plan'
const SOURCE = 'Harbor walk: notes'
const OFFLINE = 'Ferry ride: offline thoughts'
const FIRST_LINE = 'Swap the cells before winter.'
const created: string[] = []
test.afterAll(() => deleteNotes(created))

const opened = (page: Page) => new URL(page.url()).searchParams.get('n')!
const picker = (page: Page) => page.locator('.bp-wikilink-menu')
const from = (page: Page) => page.getByTestId('linked-from')
const to = (page: Page) => page.getByTestId('links-to')
const synced = (page: Page) => expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 30_000})

type Stored = {_id: string; links?: {_ref: string}[]; body?: unknown}

async function onServer(id: string): Promise<Stored | undefined> {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=drafts&limit=2&filter[_id][in]=${id},drafts.${id}`)
  const docs = ((await res.json()) as {result: {documents: Stored[]}}).result.documents
  return docs.find((d) => d._id.startsWith('drafts.')) ?? docs[0]
}
const linksOnServer = async (id: string) => ((await onServer(id))?.links ?? []).map((l) => l._ref)
const link = (page: Page) => page.getByTestId('canvas').locator('[data-wikilink]')

async function newNote(page: Page, title: string) {
  const before = opened(page)
  await page.keyboard.press('ControlOrMeta+n')
  await expect(page.getByTestId('title')).toBeFocused()
  await expect.poll(() => opened(page)).not.toBe(before)
  const id = opened(page)
  created.push(id)
  await page.keyboard.type(title)
  return id
}

async function linkTo(page: Page, query: string, title: string) {
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('canvas').locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type(`Next stop: [[${query}`)
  await expect(picker(page)).toContainText('Link to note')
  await expect(picker(page).locator('.bp-wikilink-item').first()).toContainText(title)
  await page.screenshot({path: test.info().outputPath(`j05-picker-dark-${page.viewportSize()!.width}.png`), animations: 'disabled'})
  await page.keyboard.press('Enter')
  await expect(picker(page)).toBeHidden()
  await expect(page.getByTestId('canvas').locator('[data-wikilink]')).toHaveText(title)
  await expect(to(page)).toHaveText([new RegExp(title)])
}

const raised = (page: Page) =>
  page.evaluate(() => {
    const probe = document.body.appendChild(Object.assign(document.createElement('div'), {style: 'background: var(--c-raised)'}))
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  })

async function onlyBrackets(page: Page) {
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Ping @team about it')
  await expect(picker(page)).toBeHidden()
  await page.keyboard.press('Enter')
  await page.keyboard.type('[[zzqx')
  await expect(picker(page)).toContainText('No matching notes')
  await expect(picker(page)).toHaveCSS('background-color', await raised(page))
  await page.keyboard.press('Enter')
  await expect(picker(page)).toBeHidden()
  await expect(page.getByTestId('canvas')).toContainText('Ping @team about it')
}

test('J05 link: [[ picks a note by title, the link opens it, and the target shows the backlink with its line', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 30_000})

  const target = await newNote(page, TARGET)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('canvas').locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type(FIRST_LINE)
  await synced(page)
  const source = await newNote(page, SOURCE)
  await linkTo(page, 'buoy batt', TARGET)
  await page.getByTestId('canvas').locator('[data-wikilink]').hover()
  await expect(page.locator('.bp-link-preview__title')).toHaveText(TARGET)
  await expect(page.locator('.bp-link-preview__addr')).toHaveText('Inbox')
  await expect(page.locator('.bp-link-preview__excerpt')).toHaveText(FIRST_LINE)
  await page.screenshot({path: test.info().outputPath('j05-preview-dark-1440.png'), animations: 'disabled'})
  await page.mouse.move(0, 0)
  await onlyBrackets(page)
  await page.screenshot({path: test.info().outputPath('j05-linked-dark-1440.png')})
  await expect.poll(() => linksOnServer(source), {timeout: 30_000}).toEqual([target])

  await page.getByTestId('canvas').locator('[data-wikilink]').click()
  await expect.poll(() => opened(page)).toBe(target)
  await expect(page.getByTestId('title')).toHaveValue(TARGET)
  await expect(from(page)).toHaveCount(1)
  await expect(from(page)).toContainText(SOURCE)
  await expect(from(page)).toContainText(`Next stop: ${TARGET}`)
  await expect(page.locator('.doc-meta .lk')).toHaveText('1 in · 0 out')
  await page.screenshot({path: test.info().outputPath('j05-backlink-dark-1440.png')})

  await page.setViewportSize({width: 390, height: 844})
  await expect(from(page)).toBeVisible()
  await from(page).scrollIntoViewIfNeeded()
  await page.screenshot({path: test.info().outputPath('j05-backlink-dark-390.png'), fullPage: true})
  await from(page).click()
  await expect.poll(() => opened(page)).toBe(source)
  expect(errors).toEqual([])
})

test('J05 offline, on a phone: a link made offline shows its backlink at once, and still after sync and a reload', async ({page, context}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  await page.setViewportSize({width: 390, height: 844})
  const target = created[0]
  await page.goto(`/?n=${target}`)
  await expect(page.getByTestId('title')).toHaveValue(TARGET, {timeout: 30_000})
  await synced(page)

  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toBeVisible({timeout: 15_000})
  const offline = await newNote(page, OFFLINE)
  await linkTo(page, 'lighthouse', TARGET)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect.poll(() => opened(page)).toBe(target)
  await expect(from(page)).toHaveCount(2)
  await expect(from(page).filter({hasText: OFFLINE})).toHaveCount(1)
  await page.screenshot({path: test.info().outputPath('j05-offline-backlink-dark-390.png'), fullPage: true})
  expect(await linksOnServer(offline)).toEqual([])

  await context.setOffline(false)
  await synced(page)
  await expect.poll(() => linksOnServer(offline), {timeout: 30_000}).toEqual([target])
  await expect(from(page).filter({hasText: OFFLINE})).toHaveCount(1)

  await page.reload()
  await expect(page.getByTestId('title')).toHaveValue(TARGET)
  await expect(from(page)).toHaveCount(2)
  await expect(from(page).filter({hasText: OFFLINE})).toContainText(`Next stop: ${TARGET}`)
  expect(errors).toEqual([])
})

test('J05 delete: a link to a deleted note reads as dead, its card says so, and it goes nowhere', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  const [target, source] = created
  await page.goto(`/?n=${target}`)
  await expect(page.getByTestId('title')).toHaveValue(TARGET, {timeout: 30_000})
  await synced(page)
  await page.getByTestId('delete-note').click()
  await expect.poll(() => opened(page)).toBeNull()

  await page.goto(`/?n=${source}`)
  await expect(link(page)).toHaveCSS('text-decoration-line', 'line-through')
  await expect(to(page)).toHaveCount(0)
  await link(page).hover()
  await expect(page.locator('.bp-link-preview__title')).toHaveText('Deleted note')
  await page.screenshot({path: test.info().outputPath('j05-dead-link-dark-1440.png'), animations: 'disabled'})
  await page.locator('.bp-link-preview__open').click()
  await page.waitForTimeout(500)
  expect(opened(page)).toBe(source)
  await link(page).click()
  await page.waitForTimeout(500)
  expect(opened(page)).toBe(source)
  expect(errors).toEqual([])
})
