import type {Locator, Page} from '@playwright/test'

export const PROSEMIRROR_FOCUS_RESYNC_MS = 20

export const focusSettled = (page: Page) => page.evaluate((ms) => new Promise((done) => setTimeout(done, ms)), PROSEMIRROR_FOCUS_RESYNC_MS)

export const lineAtCaret = (page: Page) =>
  page.evaluate(() => {
    const at = getSelection()?.focusNode
    const el = at instanceof Element ? at : at?.parentElement
    return el?.closest('[contenteditable="true"] p')?.textContent ?? null
  })

export async function clickCaret(target: Locator, position: {x: number; y: number}) {
  await target.click({position})
  await focusSettled(target.page())
}
