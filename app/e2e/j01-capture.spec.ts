import {expect, test, type Page} from '@playwright/test'
import {deleteNotes, serverNoteIds} from './fixtures-cleanup'

const created: string[] = []
test.afterAll(() => deleteNotes(created))

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1]

test('J01 capture: N gives a focused title, typing autosaves title and body to Barkpark', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible()
  await expect(page.getByTestId('new-note')).toBeEnabled()

  const t0 = Date.now()
  await page.keyboard.press('n')
  const title = page.getByTestId('title')
  await expect(title).toBeFocused()
  const toCursor = Date.now() - t0
  const id = new URL(page.url()).searchParams.get('n')
  expect(id).toMatch(/^note-/)
  created.push(id!)
  expect(toCursor).toBeLessThan(1000)

  await page.evaluate(() => {
    const w = window as unknown as {lag: number[]}
    w.lag = []
    let down = 0
    addEventListener('keydown', (e) => (down = e.timeStamp), true)
    addEventListener('input', () => w.lag.push(performance.now() - down))
  })
  const name = `J01 capture ${Date.now()}`
  const status = page.getByTestId('save-status')
  await page.keyboard.type(name)
  await expect(status).toHaveText('Saving…')
  await expect(status).toHaveText('Saved', {timeout: 15_000})
  const lag = await page.evaluate(() => (window as unknown as {lag: number[]}).lag)
  expect(lag.length).toBe(name.length)
  expect(p95(lag)).toBeLessThan(16)
  await expect(page.getByTestId('note-row').filter({hasText: name})).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('Enter')
  const canvas = page.getByTestId('canvas')
  await expect(canvas.locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('Typed into the canvas.')
  await expect(status).toHaveText('Saving…', {timeout: 5_000})
  await expect(status).toHaveText('Saved', {timeout: 15_000})

  await page.reload()
  await expect(page.getByTestId('title')).toHaveValue(name)
  await expect(page.getByTestId('canvas')).toContainText('Typed into the canvas.')
  console.log(`J01: N → cursor ${toCursor} ms; keystroke → input p95 ${p95(lag).toFixed(1)} ms over ${lag.length} keys`)
  expect(errors).toEqual([])
})

const search = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)
const rowOf = (page: Page, id: string) => page.locator(`[data-testid="note-row"][data-note-id="${id}"]`)
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

async function capture(page: Page, key: string) {
  const before = search(page).n
  await page.keyboard.press(key)
  await expect(page.getByTestId('title')).toBeFocused({timeout: 2_000})
  await expect.poll(() => search(page).n).not.toBe(before)
  const id = search(page).n
  expect(id).toMatch(/^note-/)
  created.push(id)
  return id
}

test('J01: Shift+N and Caps Lock N capture outside the editor; Cmd/Ctrl-N captures from inside the title too', async ({page}) => {
  await page.goto('/')
  await expect(page.getByTestId('new-note')).toBeEnabled()
  const a = await capture(page, 'Shift+N')
  await blur(page)
  const b = await capture(page, 'N')
  await expect(page.getByTestId('title')).toHaveValue('')
  const c = await capture(page, 'ControlOrMeta+n')
  expect(new Set([a, b, c]).size).toBe(3)
})

test('J01: N lands where you are: under a tag it carries the tag, under an unknown notebook it opens Inbox', async ({page}) => {
  await page.goto('/?tag=harbor')
  await expect(page.getByTestId('new-note')).toBeEnabled()
  const tagged = await capture(page, 'n')
  expect(search(page)).toEqual({tag: 'harbor', n: tagged})
  await expect(rowOf(page, tagged)).toHaveAttribute('aria-selected', 'true', {timeout: 2_000})
  await expect(page.locator('.doc-meta').getByRole('link', {name: '#harbor'})).toBeVisible({timeout: 2_000})

  await page.goto('/?nb=fx-nb-gone')
  await expect(page.getByTestId('new-note')).toBeEnabled()
  const lost = await capture(page, 'n')
  expect(search(page)).toEqual({nb: 'fx-nb-inbox', n: lost})
  await expect(rowOf(page, lost)).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.nbchip')).toHaveText('Inbox')
})

test('J01: leaving a new note that is still empty removes it, online and offline; a titled one stays', async ({page, context}) => {
  await page.goto('/')
  const rows = page.getByTestId('note-row')
  await expect(page.getByTestId('new-note')).toBeEnabled()
  const count = await rows.count()
  const synced = page.getByTestId('sync-status')

  const online = await capture(page, 'n')
  await expect(rows).toHaveCount(count + 1)
  await page.goBack()
  await expect(rows).toHaveCount(count, {timeout: 2_000})
  await expect(rowOf(page, online)).toHaveCount(0)
  await expect(synced).toHaveText('Synced', {timeout: 15_000})
  expect(await serverNoteIds()).not.toContain(online)

  await context.setOffline(true)
  const offline = await capture(page, 'n')
  await page.goBack()
  await expect(rowOf(page, offline)).toHaveCount(0)
  await expect(synced).toHaveText('Offline')
  await context.setOffline(false)
  await expect(synced).toHaveText('Synced', {timeout: 15_000})
  expect(await serverNoteIds()).not.toContain(offline)

  const kept = await capture(page, 'n')
  await page.keyboard.type('J01 kept on leave')
  await expect(page.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
  await page.goBack()
  await expect(rowOf(page, kept)).toHaveCount(1)
  await expect(rows).toHaveCount(count + 1)
})
