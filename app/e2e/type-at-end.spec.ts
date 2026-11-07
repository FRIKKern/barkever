import {expect, test} from '@playwright/test'
import {canvas, created, leave, newNote, serverNote, status, typeAtEndOf} from './devices'
import {deleteNotes} from './fixtures-cleanup'
import {blockText} from '../src/lib/model.ts'

test.afterAll(() => deleteNotes(created))

test('typeAtEndOf types at the end of a block that wraps onto several lines', async ({page}) => {
  const body = 'A long harbour line that wraps. '.repeat(30).trim()
  const id = await newNote(page, `Wrapped ${Date.now()}`, body)
  const block = canvas(page).locator('[contenteditable="true"] > [data-bp-id]').nth(0)
  const box = (await block.boundingBox())!
  expect(box.height, 'the block wraps').toBeGreaterThan(80)
  await typeAtEndOf(page, 0, ' END.')
  await leave(page)
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await expect.poll(async () => blockText((await serverNote(id))?.body?.blocks[0] ?? {id: '', type: 'paragraph'}), {timeout: 15_000}).toBe(`${body} END.`)
})
