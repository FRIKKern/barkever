import {expect, test, type Page} from '@playwright/test'

const search = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)

test('J02 browse: sidebar → notebook → list → note, every step in the URL; Back and Forward work', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const title = page.getByTestId('title')

  await page.getByTestId('side-notebook').filter({hasText: 'Projects'}).click()
  await expect(page).toHaveURL(/nb=fx-nb-projects/)
  await expect(page.getByTestId('list-head')).toContainText('Projects')
  const notebooks = await page.getByTestId('note-notebook').evaluateAll((els) => els.map((e) => e.getAttribute('data-notebook')))
  expect(notebooks.length).toBeGreaterThan(0)
  expect(new Set(notebooks)).toEqual(new Set(['Projects']))

  await page.getByTestId('note-row').filter({hasText: 'Harbor redesign: sitemap'}).click()
  await expect(page).toHaveURL(/n=fx-note-01/)
  await expect(title).toHaveValue('Harbor redesign: sitemap')
  await expect(page.getByTestId('graph-center')).toContainText('sitemap')
  await expect(page.getByTestId('linked-from')).toHaveCount(3)

  await page.getByTestId('links-to').filter({hasText: 'Harbor redesign: kickoff'}).click()
  await expect(title).toHaveValue('Harbor redesign: kickoff')
  expect(search(page)).toEqual({nb: 'fx-nb-projects', n: 'fx-note-00'})

  await page.getByTestId('graph-node').first().click()
  await expect(title).not.toHaveValue('Harbor redesign: kickoff')
  const viaGraph = search(page).n

  await page.goBack()
  await expect(title).toHaveValue('Harbor redesign: kickoff')
  await page.goBack()
  await expect(title).toHaveValue('Harbor redesign: sitemap')
  await page.goBack()
  await expect(title).toHaveCount(0)
  expect(search(page)).toEqual({nb: 'fx-nb-projects'})
  await expect(page.getByTestId('list-head')).toContainText('Projects')

  await page.goForward()
  await expect(title).toHaveValue('Harbor redesign: sitemap')
  await page.goForward()
  await page.goForward()
  expect(search(page).n).toBe(viaGraph)

  await page.goto('/?nb=fx-nb-projects&n=fx-note-01')
  await expect(title).toHaveValue('Harbor redesign: sitemap')
  await expect(page.getByTestId('note-row').filter({hasText: 'Harbor redesign: sitemap'})).toHaveAttribute('aria-selected', 'true')

  await page.getByTestId('side-all').click()
  expect(search(page)).toEqual({})
  expect(errors).toEqual([])
})

const rowOf = (page: Page, id: string) => page.locator(`[data-testid="note-row"][data-note-id="${id}"]`)

test('J02: the tab names the open note, and the list again after Back', async ({page}) => {
  await page.goto('/?nb=fx-nb-projects')
  await page.getByTestId('note-row').filter({hasText: 'Harbor redesign: sitemap'}).click()
  await expect(page).toHaveTitle('Harbor redesign: sitemap · Barkever')
  await page.goBack()
  await expect(page.getByTestId('title')).toHaveCount(0)
  await expect(page).toHaveTitle('Projects · Barkever')
})

test('J02: a deep link to the bottom row scrolls it into view', async ({page}) => {
  await page.goto('/')
  const last = (await page.getByTestId('note-row').last().getAttribute('data-note-id'))!
  await page.goto(`/?n=${last}`)
  await expect(rowOf(page, last)).toHaveAttribute('aria-selected', 'true')
  await expect(rowOf(page, last)).toBeInViewport()
})

test.describe('at 390 px', () => {
  test.use({viewport: {width: 390, height: 844}})

  test('J02: ‹ Projects is a real back step: history back after the list, replace after a deep link', async ({page}) => {
    const title = page.getByTestId('title')
    const back = page.locator('.editor .back')
    await page.goto('/')
    await page.goto('/?nb=fx-nb-projects')
    await page.getByTestId('note-row').filter({hasText: 'Harbor redesign: sitemap'}).click()
    await expect(title).toHaveValue('Harbor redesign: sitemap')
    await back.click()
    await expect(title).toHaveCount(0)
    expect(search(page)).toEqual({nb: 'fx-nb-projects'})
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(title).toHaveCount(0)

    await page.goto('/?nb=fx-nb-projects&n=fx-note-01')
    await expect(title).toHaveValue('Harbor redesign: sitemap')
    await back.click()
    await expect(title).toHaveCount(0)
    expect(search(page)).toEqual({nb: 'fx-nb-projects'})
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
    await expect(title).toHaveCount(0)
  })
})
