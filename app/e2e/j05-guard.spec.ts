import {expect, test} from '@playwright/test'

test('an editor older than contract 1.17.0 is refused once per page: the note reads only, and switching notes adds no editor files', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  await page.addInitScript(() => {
    const define = customElements.define.bind(customElements)
    customElements.define = (name, ctor, options) => {
      if (name === 'bp-paper-editor') Object.defineProperty(ctor, 'CONTRACT_VERSION', {value: '1.16.0'})
      define(name, ctor, options)
    }
  })
  await page.goto('/')
  const rows = page.getByTestId('note-row')
  await expect(rows.first()).toBeVisible({timeout: 30_000})
  const refused = page.getByText('Barkpark serves editor 1.16.0; Barkever needs 1.17.0 or newer')
  for (let i = 0; i < 4; i++) {
    await rows.nth(i).click()
    await expect(refused).toBeVisible()
  }
  await expect(page.getByTestId('canvas')).toHaveCount(0)
  expect(await page.locator('script[src*="bp-paper-editor"]').count()).toBe(1)
  expect(await page.locator('link[href*="bp-paper-"]').count()).toBe(3)
  await page.screenshot({path: test.info().outputPath('j05-guard-old-dark-1440.png')})
  await page.setViewportSize({width: 390, height: 844})
  await page.screenshot({path: test.info().outputPath('j05-guard-old-dark-390.png')})
  expect(errors).toEqual([])
})
