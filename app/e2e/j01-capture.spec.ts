import {expect, test} from '@playwright/test'
import {deleteNotes} from './fixtures-cleanup'

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
