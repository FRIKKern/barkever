import {expect, test, type Page} from '@playwright/test'

const inside = (page: Page, selector: string) => page.evaluate((s) => !!document.activeElement?.closest(s), selector)

for (const width of [1440, 390]) {
  test.describe(`at ${width} px`, () => {
    test.use({viewport: {width, height: width > 700 ? 900 : 844}})

    test('J02 keyboard: arrows move through the list, Enter opens, Escape returns to the list', async ({page}) => {
      await page.goto('/?nb=fx-nb-projects')
      const rows = page.getByTestId('note-row')
      await expect(page.getByTestId('new-note')).toBeEnabled()
      await page.keyboard.press('/')
      await expect(page.getByTestId('search')).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(rows.nth(0)).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowDown')
      await page.keyboard.press('ArrowUp')
      await expect(rows.nth(1)).toBeFocused({timeout: 2_000})
      const id = (await rows.nth(1).getAttribute('data-note-id'))!
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`n=${id}`))
      await expect(page.getByTestId('title')).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(page.locator(`[data-testid="note-row"][data-note-id="${id}"]`)).toBeFocused({timeout: 2_000})
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('title')).toBeFocused()
    })
  })
}

test('J02 a11y: the search box is named for what it does', async ({page}) => {
  await page.goto('/')
  await expect(page.getByRole('searchbox', {name: 'Search notes'})).toBeVisible({timeout: 5_000})
})

test('J02 keyboard: graph nodes are buttons you can focus and press', async ({page}) => {
  await page.goto('/?nb=fx-nb-projects&n=fx-note-01')
  const node = page.getByTestId('link-graph').getByRole('button', {name: 'Harbor redesign: kickoff'})
  await node.focus({timeout: 5_000})
  await expect(node).toBeFocused()
  await expect(page.getByTestId('graph-tip')).toContainText('Harbor redesign: kickoff')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: kickoff')
})

test.describe('at 390 px', () => {
  test.use({viewport: {width: 390, height: 844}})

  test('J02 a11y: the notebook drawer is modal: focus stays inside, Escape closes it and returns focus', async ({page}) => {
    await page.goto('/')
    const menu = page.getByRole('button', {name: 'Notebooks'})
    await menu.click()
    const drawer = page.getByRole('dialog', {name: 'Notebooks'})
    await expect(drawer).toBeVisible({timeout: 5_000})
    expect(await inside(page, '.sidebar')).toBe(true)
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('.sidebar'))).toBe(true)
    }
    await page.getByTestId('search').focus()
    expect(await inside(page, '.list')).toBe(false)
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(page.locator('.sidebar')).toBeHidden()
    await expect(menu).toBeFocused()
  })
})
