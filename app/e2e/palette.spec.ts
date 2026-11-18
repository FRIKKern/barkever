import {expect, test, type Page} from '@playwright/test'

const palette = (page: Page) => page.getByTestId('palette')
const box = (page: Page) => page.getByTestId('palette-input')
const picks = (page: Page) => page.getByTestId('palette-pick')

test('J04 palette: Cmd-K from the editor, type, Enter opens the note, Back returns; Escape closes and the caret comes back', async ({page}) => {
  await page.goto('/?n=fx-note-01')
  const canvas = page.locator('.ProseMirror')
  await canvas.click({timeout: 15_000})
  await page.keyboard.press('End')
  const caret = () => page.evaluate(() => `${getSelection()?.anchorNode?.textContent}@${getSelection()?.anchorOffset}`)
  const before = await caret()

  await page.keyboard.press('Meta+k')
  await expect(box(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(palette(page)).toHaveCount(0)
  expect(await page.evaluate(() => !!document.activeElement?.closest('.ProseMirror'))).toBe(true)
  expect(await caret()).toBe(before)

  await page.keyboard.press('Control+k')
  await box(page).fill('sourdough')
  await expect(picks(page).first()).toHaveAttribute('data-key', 'note:fx-note-32')
  await expect(box(page)).toHaveAttribute('aria-activedescendant', (await picks(page).first().getAttribute('id'))!)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/n=fx-note-32/)
  await expect(page.getByTestId('title')).toBeFocused()
  await page.goBack()
  await expect(page).toHaveURL(/n=fx-note-01/)
})

test.describe('at 390 px', () => {
  test.use({viewport: {width: 390, height: 844}})

  test('J04 palette: a tag pick opens its list, arrows move, the scrim closes', async ({page}) => {
    await page.goto('/')
    await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 15_000})
    await page.keyboard.press('Meta+k')
    await box(page).fill('weekly')
    await expect(picks(page).first()).toHaveAttribute('data-key', 'tag:weekly')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/tag=weekly/)
    await page.keyboard.press('Meta+k')
    await expect(palette(page)).toBeVisible()
    await page.locator('.pal-scrim').click({position: {x: 5, y: 5}})
    await expect(palette(page)).toHaveCount(0)
  })
})
