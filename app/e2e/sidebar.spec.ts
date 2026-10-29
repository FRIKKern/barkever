import {expect, test} from '@playwright/test'

test('offline shows one quiet line and the sync dot; back online clears both', async ({page, context}) => {
  await page.goto('/?n=fx-note-01')
  await expect(page.getByTestId('title')).toBeVisible()
  await expect(page.getByTestId('offline')).toHaveCount(0)
  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toHaveText(/^Offline\./)
  await expect(page.locator('.side-foot')).toContainText('Offline')
  await context.setOffline(false)
  await expect(page.getByTestId('offline')).toHaveCount(0)
  await expect(page.locator('.side-foot')).toContainText('Synced')
})

test('a starred note sits in Shortcuts and an opened note in Recent, both kept in Barkpark prefs', async ({page}) => {
  await page.goto('/?n=fx-note-02')
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: wireframes')
  const star = page.getByTestId('star')
  const shortcut = page.getByTestId('side-shortcut').filter({hasText: 'Harbor redesign: wireframes'})
  const wasStarred = (await star.getAttribute('aria-pressed')) === 'true'
  await star.click()
  await expect(shortcut).toHaveCount(wasStarred ? 0 : 1)
  await expect(page.getByTestId('side-recent').first()).toHaveText('Harbor redesign: wireframes')

  await page.waitForTimeout(1_500)
  await page.reload()
  await expect(shortcut).toHaveCount(wasStarred ? 0 : 1)
  await expect(page.getByTestId('side-recent').first()).toHaveText('Harbor redesign: wireframes')

  await page.getByTestId('star').click()
  await expect(shortcut).toHaveCount(wasStarred ? 1 : 0)
  await page.waitForTimeout(1_500)
})

test('the theme toggle flips light and dark and remembers the pick', async ({page}) => {
  await page.emulateMedia({colorScheme: 'dark'})
  await page.goto('/')
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const dark = await bg()
  await page.getByRole('button', {name: 'Toggle theme'}).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const light = await bg()
  expect(light).not.toBe(dark)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await bg()).toBe(light)
})
