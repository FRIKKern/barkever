import {expect, test, type Page} from '@playwright/test'
import {deleteNotes} from './fixtures-cleanup'
import {canvas, created, everything, newNote, serverNote, status, synced} from './devices'

test.afterAll(() => deleteNotes(created))

type Canvas = HTMLElement & {sourceMode: boolean; toggleSourceMode(): void}

const source = (page: Page) => canvas(page).getByRole('textbox', {name: 'Markdown source'})
const sourceMode = (page: Page) => canvas(page).evaluate((el) => (el as Canvas).sourceMode)
const toggle = 'ControlOrMeta+Shift+m'
const toEnd = (page: Page) => source(page).evaluate((ta: HTMLTextAreaElement) => ta.setSelectionRange(ta.value.length, ta.value.length))
const caret = (page: Page) => source(page).evaluate((ta: HTMLTextAreaElement) => [ta.selectionStart, ta.selectionEnd, ta.value.length])
const stored = async (id: string, text: string) => expect.poll(async () => everything(await serverNote(id)), {timeout: 15_000}).toContain(text)

async function openSource(page: Page) {
  await canvas(page).locator('[contenteditable="true"] > [data-bp-id]').first().click()
  await page.keyboard.press(toggle)
  await expect(source(page)).toBeFocused()
  await toEnd(page)
}

async function richThenSource(page: Page) {
  await canvas(page).locator('[contenteditable="true"] > [data-bp-id]').first().click()
  await page.keyboard.press('End')
  await canvas(page).evaluate((el) => el.addEventListener('input', () => (el as Canvas).toggleSourceMode(), {once: true}))
  await page.keyboard.type('R')
  await expect(source(page)).toBeFocused()
  await toEnd(page)
}

for (const width of [1440, 390]) {
  test.describe(`at ${width} px, dark`, () => {
    test.use({viewport: {width, height: width > 700 ? 900 : 844}, colorScheme: 'dark'})

    test('Markdown source mode stays open while I type and a second after, and what I typed is saved while it stays open', async ({page}) => {
      if (process.env.E2E_CPU) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', {rate: Number(process.env.E2E_CPU)})
      const id = await newNote(page, `Source mode ${Date.now()}`, 'Base.')
      await richThenSource(page)
      await page.keyboard.type(' Typed in source.', {delay: 40})
      await page.waitForTimeout(1000)
      await expect(source(page), 'source mode is still open a second after the last key').toBeFocused()
      expect(await sourceMode(page)).toBe(true)
      await expect(source(page)).toHaveValue(/Base\.R Typed in source\.$/)
      const [start, end, length] = await caret(page)
      expect([start, end], 'the caret stays at the end of what I typed').toEqual([length, length])
      await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
      await stored(id, 'Base.R Typed in source.')
      expect(await sourceMode(page), 'saving left source mode open').toBe(true)
      await page.screenshot({path: test.info().outputPath(`source-mode-${width}-dark.png`)})
      await page.keyboard.press(toggle)
      await expect(source(page)).toHaveCount(0)
      await expect(canvas(page)).toContainText('Base.R Typed in source.')
      await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
      await synced(page)
      expect(everything(await serverNote(id))).toContain('Base.R Typed in source.')
    })
  })
}

test('Markdown source mode opened with the keyboard keeps my selection while it saves, and leaving it sends nothing new', async ({page}) => {
  const id = await newNote(page, `Source select ${Date.now()}`, 'Base.')
  await openSource(page)
  await page.keyboard.type(' More words here.')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  const selected = await caret(page)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await stored(id, 'Base. More words here.')
  expect(await caret(page), 'the selection is where I left it').toEqual(selected)
  await expect(source(page)).toBeFocused()
  await page.keyboard.press(toggle)
  await expect(source(page)).toHaveCount(0)
  await expect(status(page)).toHaveText('Saved')
  await synced(page)
  expect(everything(await serverNote(id))).toContain('Base. More words here.')
})

for (const door of ['another note', 'a reload'] as const)
  test(`what I type in Markdown source mode is stored when I leave it by opening ${door} straight after`, async ({page}) => {
    const id = await newNote(page, `Source leave ${Date.now()}`, 'Base.')
    await openSource(page)
    await page.keyboard.type(' Kept.')
    if (door === 'a reload') {
      await page.reload()
      await expect(canvas(page)).toContainText('Base. Kept.', {timeout: 15_000})
    } else {
      await page.locator(`[data-testid="note-row"]:not([data-note-id="${id}"])`).first().click()
      await expect(page).not.toHaveURL(new RegExp(`n=${id}`))
    }
    await synced(page)
    expect(everything(await serverNote(id))).toContain('Base. Kept.')
  })

test('a page killed in Markdown source mode right after I type has kept what I typed', async ({page}) => {
  const id = await newNote(page, `Source crash ${Date.now()}`, 'Base.')
  await openSource(page)
  await page.keyboard.type(' Before the crash.')
  await expect.poll(() => canvas(page).evaluate((el) => (el as Canvas & {hasPendingChanges(): boolean}).hasPendingChanges()), {intervals: [10]}).toBe(false)
  expect(await sourceMode(page)).toBe(true)
  const session = await page.context().newCDPSession(page)
  await session.send('Page.crash').catch(() => undefined)
  const again = await page.context().newPage()
  await again.goto(`/?n=${id}`)
  await expect(canvas(again)).toContainText('Base. Before the crash.', {timeout: 15_000})
  await synced(again)
  expect(everything(await serverNote(id))).toContain('Base. Before the crash.')
})
