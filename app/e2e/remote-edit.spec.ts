import {expect, test, type Browser, type Page} from '@playwright/test'
import {deleteNotes} from './fixtures-cleanup'
import {SESSION_FILE} from './account'

const created: string[] = []
test.afterAll(() => deleteNotes(created))

const BUDGET_MS = 300
const EDITS = 20
const canvas = (page: Page) => page.getByTestId('canvas')
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1]

async function device(browser: Browser, baseURL: string) {
  const context = await browser.newContext({baseURL, storageState: SESSION_FILE})
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 20_000})
  return page
}

const conflictsOf = (page: Page, id: string) =>
  page.evaluate(async (id) => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open(name)
      r.onsuccess = () => ok(r.result)
    })
    const note = await new Promise<{conflicts?: unknown[]} | undefined>((ok) => {
      const r = db.transaction('notes').objectStore('notes').get(id)
      r.onsuccess = () => ok(r.result)
    })
    db.close()
    return note?.conflicts ?? []
  }, id)

test('one person typing at a human pace makes no conflict, and the other device shows each edit within 300 ms (p95)', async ({browser, baseURL}) => {
  test.setTimeout(120_000)
  const a = await device(browser, baseURL!)
  const b = await device(browser, baseURL!)

  await a.keyboard.press('n')
  await expect(a.getByTestId('title')).toBeFocused()
  const id = new URL(a.url()).searchParams.get('n')!
  created.push(id)
  await a.keyboard.type('Remote edit probe typed at a human pace', {delay: 70})
  await expect(canvas(a).locator('[contenteditable="true"]')).toBeAttached()
  await a.keyboard.press('Enter')
  await a.keyboard.type('The body is typed at seventy milliseconds a key, like a person typing steadily.', {delay: 70})
  await expect(a.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
  expect(await conflictsOf(a, id), 'typing alone never conflicts with itself').toEqual([])

  await b.goto(`/?n=${id}`)
  await expect(canvas(b)).toContainText('like a person typing steadily.', {timeout: 15_000})
  await b.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await a.waitForTimeout(1000)

  const lag: number[] = []
  for (let i = 0; i < EDITS; i++) {
    const mark = `RM${i}x`
    const seen = b.evaluate(
      (mark) =>
        new Promise<number>((ok) => {
          const tick = () => (document.querySelector('[data-testid=canvas]')?.textContent?.includes(mark) ? ok(Date.now()) : requestAnimationFrame(tick))
          tick()
          setTimeout(() => ok(-1), 10_000)
        }),
      mark,
    )
    await a.keyboard.type(` ${mark}`)
    const sent = Date.now()
    const at = await seen
    lag.push(at < 0 ? Infinity : at - sent)
    await a.waitForTimeout(600)
  }
  console.log(`remote edit ms ${JSON.stringify({p50: [...lag].sort((x, y) => x - y)[EDITS / 2], p95: p95(lag), all: lag})}`)
  await expect(a.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
  await b.waitForTimeout(1000)
  const conflicts = [await conflictsOf(a, id), await conflictsOf(b, id)]
  await Promise.all([a.context().close(), b.context().close()])
  expect(conflicts[0], 'no conflict on the typing device').toEqual([])
  expect(conflicts[1], 'no conflict on the watching device').toEqual([])
  expect(p95(lag), `remote edit p95 ${p95(lag)} ms`).toBeLessThan(BUDGET_MS)
})
