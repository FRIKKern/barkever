import {expect, test} from '@playwright/test'

test('home lists exactly the 50 fixture notes, each in a named notebook', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const rows = page.getByTestId('note-row')
  await expect(rows.first()).toBeVisible()
  await expect(rows).toHaveCount(50)
  const notebooks = await page.getByTestId('note-notebook').evaluateAll((els) => els.map((e) => e.getAttribute('data-notebook')))
  expect(notebooks.length).toBe(await rows.count())
  expect(notebooks.filter((n) => !n)).toEqual([])
  expect(errors).toEqual([])
})
