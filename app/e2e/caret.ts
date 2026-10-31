import type {Locator, Page} from '@playwright/test'

export const PROSEMIRROR_FOCUS_RESYNC_MS = 20

export const focusSettled = (page: Page) => page.evaluate((ms) => new Promise((done) => setTimeout(done, ms)), PROSEMIRROR_FOCUS_RESYNC_MS)

export async function clickCaret(target: Locator, position: {x: number; y: number}) {
  await target.click({position})
  await focusSettled(target.page())
}
