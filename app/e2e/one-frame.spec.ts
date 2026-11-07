import {expect, test} from '@playwright/test'

const sample = () => {
  const shown = (el: Element | null) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0
  const seen = {frames: 0, body: 0, canvas: 0, both: 0}
  const look = () => {
    const body = shown(document.querySelector('.doc-body .blocks'))
    const canvas = shown(document.querySelector('.doc-body bp-paper-canvas'))
    if (body) seen.body++
    if (canvas) seen.canvas++
    if (body && canvas) seen.both++
  }
  const frame = () => {
    seen.frames++
    look()
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  new MutationObserver(look).observe(document, {subtree: true, childList: true, attributes: true, attributeFilter: ['class']})
  Object.assign(window, {seen})
}

test('no frame shows the read-only body and the canvas together while a note opens', async ({page}) => {
  await page.addInitScript(sample)
  await page.goto('/')
  const rows = page.getByTestId('note-row')
  await expect(rows.first()).toBeVisible({timeout: 30_000})
  for (let i = 0; i < 4; i++) {
    await rows.nth(i).click()
    await expect(page.getByTestId('canvas')).toBeVisible({timeout: 30_000})
  }
  const seen = await page.evaluate(() => (window as unknown as {seen: Record<string, number>}).seen)
  expect(seen.frames).toBeGreaterThan(0)
  expect(seen.body).toBeGreaterThan(0)
  expect(seen.canvas).toBeGreaterThan(0)
  expect(seen.both).toBe(0)
})
