import {expect, test} from '@playwright/test'

test('home lists at least 50 notes with their notebooks', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const titles = page.getByTestId('note-title')
  await expect(titles.first()).toBeVisible()
  expect(await titles.count()).toBeGreaterThanOrEqual(50)
  const notebooks = await page.getByTestId('note-notebook').allTextContents()
  expect(notebooks.length).toBe(await titles.count())
  expect(notebooks.filter((n) => n === 'No notebook')).toEqual([])
  expect(errors).toEqual([])
})
