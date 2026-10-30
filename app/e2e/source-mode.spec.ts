import {expect, test, type Page} from '@playwright/test'
import {deleteNotes} from './fixtures-cleanup'
import {canvas, created, everything, newNote, serverNote, status, synced} from './devices'

test.afterAll(() => deleteNotes(created))

const source = (page: Page) => canvas(page).locator('textarea.bp-canvas-source')
const toggle = 'ControlOrMeta+Shift+m'
const toEnd = (page: Page) => source(page).evaluate((ta: HTMLTextAreaElement) => ta.setSelectionRange(ta.value.length, ta.value.length))

async function richThenSource(page: Page) {
  await canvas(page).locator('[contenteditable="true"] > [data-bp-id]').first().click()
  await page.keyboard.press('End')
  await canvas(page).evaluate((el) => el.addEventListener('input', () => (el as HTMLElement & {toggleSourceMode(): void}).toggleSourceMode(), {once: true}))
  await page.keyboard.type('R')
  await expect(source(page)).toBeFocused()
}

for (const width of [1440, 390]) {
  test.describe(`at ${width} px, dark`, () => {
    test.use({viewport: {width, height: width > 700 ? 900 : 844}, colorScheme: 'dark'})

    test('Markdown source mode stays open while I type and a second after, and what I typed is stored when I leave it', async ({page}) => {
      if (process.env.E2E_CPU) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', {rate: Number(process.env.E2E_CPU)})
      const id = await newNote(page, `Source mode ${Date.now()}`, 'Base.')
      await richThenSource(page)
      await toEnd(page)
      await page.keyboard.type(' Typed in source.', {delay: 40})
      await page.waitForTimeout(1000)
      await expect(source(page), 'source mode is still open a second after the last key').toBeFocused()
      await expect(source(page)).toHaveValue(/Base\.R Typed in source\.$/)
      await expect(status(page), 'source text is not saved until I leave source mode').toHaveText('Saving…')
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

test('Markdown source mode opened with the keyboard: typing and back to what it showed reads Saved, and leaving it stays Saved', async ({page}) => {
  await newNote(page, `Source undo ${Date.now()}`, 'Base.')
  await canvas(page).locator('[contenteditable="true"] > [data-bp-id]').first().click()
  await page.keyboard.press(toggle)
  await expect(source(page)).toBeFocused()
  await expect(source(page)).toHaveValue('Base.')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await toEnd(page)
  await page.keyboard.type('x')
  await expect(status(page)).toHaveText('Saving…')
  await page.keyboard.press('Backspace')
  await expect(status(page)).toHaveText('Saved')
  await page.waitForTimeout(1000)
  await expect(source(page)).toBeFocused()
  await page.keyboard.press(toggle)
  await expect(source(page)).toHaveCount(0)
  await expect(status(page)).toHaveText('Saved')
})
