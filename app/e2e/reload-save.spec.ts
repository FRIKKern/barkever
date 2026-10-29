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
