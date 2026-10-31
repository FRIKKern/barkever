import {expect, type Page} from '@playwright/test'
import {deleteNotes} from './fixtures-cleanup'
import {clickCaret, focusSettled} from './caret'

export type Pm = {state: {doc: {child: (i: number) => {nodeSize: number}}}; commands: {setTextSelection: (r: {from: number; to: number}) => void}; view: {focus: () => void}}

const created: string[] = []
export const cleanup = () => deleteNotes(created.splice(0))

export const status = (page: Page) => page.getByTestId('save-status')
export const canvas = (page: Page) => page.getByTestId('canvas')

export async function newNote(page: Page, title: string) {
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 15_000})
  await expect(page.getByTestId('new-note')).toBeEnabled()
  await page.keyboard.press('n')
  await expect(page.getByTestId('title')).toBeFocused()
  const id = new URL(page.url()).searchParams.get('n')!
  created.push(id)
  await page.keyboard.type(title)
  return id
}

export async function typeAtEnd(page: Page, text: string) {
  const editable = canvas(page).locator('[contenteditable="true"]')
  const last = editable.locator('> [data-bp-id]').last()
  await last.waitFor({state: 'attached'})
  const box = await last.boundingBox()
  if (box?.height) await clickCaret(last, {x: box.width - 2, y: box.height / 2})
  else await editable.focus().then(() => focusSettled(page))
  await page.keyboard.press('End')
  await page.keyboard.type(text)
}

export const errorsOf = (page: Page) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  return errors
}

export async function twoBlockNote(page: Page, title: string) {
  const id = await newNote(page, title)
  await expect(canvas(page).locator('[contenteditable="true"]')).toBeAttached()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Mine.')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Theirs.')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  return id
}
