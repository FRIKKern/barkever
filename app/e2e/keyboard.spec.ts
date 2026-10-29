import {expect, test, type Page} from '@playwright/test'
import {barkpark, DATASET} from './fixtures-cleanup'

const serverTitle = async (id: string) => ((await (await barkpark(`/v1/data/query/${DATASET}/note?perspective=drafts&filter[_id][in]=${id},drafts.${id}`)).json()) as {result: {documents: {title?: string}[]}}).result.documents[0]?.title

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
      const title = (await serverTitle(id))!
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`n=${id}`))
      await expect(page.getByTestId('title')).toBeFocused()
      await expect(page.getByTestId('title')).toHaveValue(title)
      await page.keyboard.press('Escape')
      await expect(page.locator(`[data-testid="note-row"][data-note-id="${id}"]`)).toBeFocused({timeout: 2_000})
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('title')).toBeFocused()
      await expect(page.getByTestId('title')).toHaveValue(title)
      await expect(page.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
      await expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 15_000})
      expect(await serverTitle(id), 'Enter on the list never edits the title').toBe(title)
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

  test('J02 a11y: picking a notebook in the drawer closes it and returns focus to the menu button', async ({page}) => {
    await page.goto('/')
    const menu = page.getByRole('button', {name: 'Notebooks'})
    await menu.click()
    const drawer = page.getByRole('dialog', {name: 'Notebooks'})
    await expect(drawer).toBeVisible({timeout: 5_000})
    await drawer.getByTestId('side-notebook').filter({hasText: 'Projects'}).first().focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/nb=fx-nb-projects/)
    await expect(drawer).toHaveCount(0)
    await expect(menu).toBeFocused()
  })

  for (const id of ['fx-note-03', 'fx-note-11'])
  test(`J02: on a note with no links, “No links yet” stays half a line clear of every node label (${id})`, async ({page}) => {
    await page.goto(`/?n=${id}`)
    const graph = page.getByTestId('link-graph')
    await expect(graph.getByTestId('graph-node')).toHaveCount(2)
    const hint = (await graph.locator('.g-hint').boundingBox())!
    const labels = await graph.locator('.g-node text').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect))
    const clear = 6
    const meets = (a: {x: number; y: number; width: number; height: number}, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y - clear < b.y + b.height && b.y < a.y + a.height + clear
    expect(labels.filter((l) => meets(hint, l))).toEqual([])
  })
})
