import {expect, test, type Page} from '@playwright/test'
import {deleteNotes} from './fixtures-cleanup'
import {created, device, errorsOf, newNote, serverNote, synced} from './devices'

test.afterAll(() => deleteNotes(created))

const tags = (page: Page) => page.getByTestId('note-tag')
const tagSets = async (id: string) => {
  const n = (await serverNote(id)) as {tags?: string[]; conflicts?: {tags?: string[]}[]} | undefined
  return [n?.tags, ...(n?.conflicts ?? []).map((c) => c.tags)].map((t) => (t ?? []).join(',')).sort()
}

async function addTag(page: Page, tag: string) {
  await page.getByTestId('tag-add').fill(tag)
  await page.getByTestId('tag-add').press('Enter')
  await expect(tags(page).filter({hasText: tag})).toHaveCount(1)
}

test('two devices tag a note differently offline: both tag sets reach Barkpark and every device, and Keep this picks one', async ({browser, baseURL}) => {
  test.setTimeout(120_000)
  const a = await device(browser, baseURL!)
  const b = await device(browser, baseURL!)
  const errors = [...errorsOf(a), ...errorsOf(b)]
  const stamp = Date.now()
  const [ta, tb] = [`a-${stamp}`, `b-${stamp}`]
  const id = await newNote(a, `Tags clash ${stamp}`, 'Base.')
  await synced(a)
  await b.goto(`/?n=${id}`)
  await expect(b.getByTestId('title')).toHaveValue(`Tags clash ${stamp}`, {timeout: 15_000})

  await Promise.all([a, b].map((p) => p.context().setOffline(true)))
  await addTag(a, ta)
  await addTag(b, tb)
  await a.context().setOffline(false)
  await synced(a)
  await expect.poll(() => tagSets(id), {timeout: 15_000}).toEqual([ta])
  await b.context().setOffline(false)
  await synced(b)
  await expect.poll(() => tagSets(id), {timeout: 15_000}).toEqual([ta, tb])
  await expect(a.getByTestId('conflict')).toHaveCount(1, {timeout: 15_000})

  const view = b.getByTestId('conflict')
  await view.locator('summary').first().click()
  await view.screenshot({path: test.info().outputPath('tags-copy.png')})
  await view.getByTestId('keep-version').click()
  await expect(tags(b)).toHaveText([new RegExp(`#${ta}`)])
  await expect(view).toHaveCount(0)
  await expect.poll(() => tagSets(id), {timeout: 15_000}).toEqual([ta])
  await expect(tags(a)).toHaveText([new RegExp(`#${ta}`)], {timeout: 15_000})
  expect(errors).toEqual([])
  await Promise.all([a.context().close(), b.context().close()])
})
