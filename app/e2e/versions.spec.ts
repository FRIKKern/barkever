import {expect, test, type Page} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'
import {canvas, created, device, errorsOf, everything, leave, newNote, serverNote, status, synced, typeAtEndOf} from './devices'
import {blockText} from '../src/lib/model.ts'

test.afterAll(() => deleteNotes(created))

const saved = async (page: Page) => {
  await leave(page)
  await expect(status(page)).toHaveText(/^(Saved|Offline · saved on this device)$/, {timeout: 15_000})
}
const firstBlock = (page: Page) => canvas(page).locator('[contenteditable="true"] > [data-bp-id]').first()
const view = (page: Page) => page.getByTestId('conflict')
const copies = (page: Page) => view(page).getByTestId('conflict-other')
const openView = async (page: Page) => {
  if (!(await view(page).evaluate((d) => (d as HTMLDetailsElement).open))) await view(page).locator('summary').first().click()
}
const mainText = async (id: string) => blockText((await serverNote(id))!.body!.blocks[0])
const kept = async (id: string) => ((await serverNote(id))?.conflicts ?? []).map((c) => c.title + ' / ' + blockText(c.body?.blocks[0] ?? {id: '', type: 'paragraph'}))

test('two offline clashes fold under one writer, Keep this makes a version the main, Dismiss works offline, both reach every device', async ({browser, baseURL}) => {
  test.setTimeout(180_000)
  const a = await device(browser, baseURL!)
  const b = await device(browser, baseURL!, 'dark')
  const errors = [...errorsOf(a), ...errorsOf(b)]
  const stamp = Date.now()
  const id = await newNote(a, `Versions ${stamp}`, 'Base.')
  await saved(a)
  await synced(a)
  await b.goto(`/?n=${id}`)
  await expect(canvas(b)).toContainText('Base.', {timeout: 15_000})

  const hour = async (x: string, y: string) => {
    await Promise.all([a, b].map((p) => p.context().setOffline(true)))
    await typeAtEndOf(a, 0, x)
    await saved(a)
    await typeAtEndOf(b, 0, y)
    await saved(b)
    await a.context().setOffline(false)
    await synced(a)
    await expect.poll(() => mainText(id), {timeout: 15_000}).toContain(x.trim())
    await b.context().setOffline(false)
    await synced(b)
    await expect.poll(async () => everything(await serverNote(id)), {timeout: 15_000}).toContain(y.trim())
    await expect(firstBlock(a)).toHaveText(await mainText(id), {timeout: 15_000})
  }
  await hour(' A1.', ' B1.')
  await hour(' a2.', ' b2.')
  expect(await mainText(id)).toBe('Base. B1. b2.')

  await a.context().setOffline(true)
  await a.getByTestId('title').fill(`Title by A ${stamp}`)
  await saved(a)
  const raw = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{patch: {id, type: 'note', set: {title: `Title by Studio ${stamp}`}}}]})})
  expect(raw.ok).toBe(true)
  await a.context().setOffline(false)
  await synced(a)
  await expect.poll(async () => (await serverNote(id))?.conflicts?.length, {timeout: 15_000}).toBe(3)
  for (const t of ['A1.', 'a2.', `Title by Studio ${stamp}`]) expect(everything(await serverNote(id))).toContain(t)

  await expect(copies(b)).toHaveCount(3, {timeout: 15_000})
  await expect(view(b).getByTestId('conflict-lane')).toHaveCount(2)
  await expect(view(b).locator('summary').first()).toHaveText('Edited in two places · 3 versions kept')
  await expect(b.locator(`[data-testid=note-row][data-note-id="${id}"]`).getByTestId('note-conflict')).toHaveText('3 versions')
  await b.locator('main.editor').screenshot({path: test.info().outputPath('quiet-line-dark.png')})
  await openView(b)
  await view(b).locator('.kb-earlier > summary').click()
  await expect(copies(b).filter({hasText: 'A1.'})).toBeVisible()
  await view(b).screenshot({path: test.info().outputPath('grouped-dark.png')})

  await view(b).getByTestId('conflict-lane').filter({hasText: 'a2.'}).getByTestId('keep-version').first().click()
  await expect(firstBlock(b)).toHaveText('Base. B1. a2.')
  await expect(copies(b)).toHaveCount(2)
  await expect.poll(() => mainText(id), {timeout: 15_000}).toBe('Base. B1. a2.')
  await expect.poll(() => kept(id), {timeout: 15_000}).toHaveLength(2)
  await expect(firstBlock(a)).toHaveText('Base. B1. a2.', {timeout: 15_000})
  await expect(copies(a)).toHaveCount(2, {timeout: 15_000})

  await a.context().setOffline(true)
  await openView(a)
  const a1 = copies(a).filter({hasText: 'A1.'})
  await expect(a1).toContainText('Your version')
  await a1.getByTestId('dismiss-version').click()
  await expect(copies(a)).toHaveCount(1)
  await expect(status(a)).toHaveText('Offline · saved on this device', {timeout: 15_000})
  expect(await kept(id), 'nothing leaves Barkpark while the device is offline').toHaveLength(2)
  await a.context().setOffline(false)
  await synced(a)
  await expect.poll(() => kept(id), {timeout: 15_000}).toEqual([`Title by Studio ${stamp} / Base. B1. b2.`])
  await expect(copies(b)).toHaveCount(1, {timeout: 15_000})

  await openView(b)
  await copies(b).getByTestId('dismiss-version').click()
  await expect(view(b)).toHaveCount(0)
  await expect.poll(() => kept(id), {timeout: 15_000}).toEqual([])
  await expect(view(a)).toHaveCount(0, {timeout: 15_000})
  expect(await mainText(id)).toBe('Base. B1. a2.')
  expect((await serverNote(id))?.title).toBe(`Title by A ${stamp}`)
  expect(errors).toEqual([])
  await Promise.all([a.context().close(), b.context().close()])
})
