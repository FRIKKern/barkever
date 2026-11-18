import {expect, test, type Page} from '@playwright/test'

const search = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)

test('J02 map: M opens every note by notebook; a click opens the note, Back returns, Escape leaves', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible()
  await page.keyboard.press('m')
  await expect(page.getByTestId('map')).toBeVisible()
  expect(search(page)).toEqual({view: 'map'})
  expect(await page.getByTestId('map-node').count()).toBeGreaterThan(20)
  expect(await page.locator('.mp-area').count()).toBeGreaterThan(3)

  const node = page.getByTestId('map').getByRole('button', {name: 'Harbor redesign: sitemap'})
  await node.hover()
  await expect(page.getByTestId('map-card')).toContainText('Harbor redesign: sitemap')
  await node.click()
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: sitemap')
  expect(search(page)).toEqual({n: 'fx-note-01'})

  await page.goBack()
  await expect(page.getByTestId('map')).toBeVisible()
  expect(search(page)).toEqual({view: 'map'})
  await page.getByTestId('map').getByRole('button', {name: 'Harbor redesign: kickoff'}).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: kickoff')

  await page.goBack()
  await expect(page.getByTestId('map')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('map')).toHaveCount(0)
  expect(search(page)).toEqual({})
  expect(errors).toEqual([])
})

test('J05 cluster: the rail shows the open note’s notes two links out, and a node opens its note', async ({page}) => {
  await page.goto('/?n=fx-note-01')
  await page.getByTestId('cluster-tab').click()
  const nodes = page.getByTestId('cluster-node')
  await expect(nodes.first()).toBeVisible()
  expect(await nodes.count()).toBeGreaterThan(3)
  const name = (await nodes.first().getAttribute('aria-label'))!
  await nodes.first().click()
  await expect(page.getByTestId('title')).toHaveValue(name)
})
