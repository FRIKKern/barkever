import {expect, test, type Locator, type Page} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'
import {created, device, errorsOf, newNote, serverNote, synced} from './devices'

test.afterAll(() => deleteNotes(created))

const tags = (page: Page) => page.getByTestId('note-tag')
type Organized = {tags?: string[]; notebook?: {_ref: string} | null; conflicts?: Organized[]}
const organized = async (id: string) => (await serverNote(id)) as Organized | undefined
const tagSets = async (id: string) => {
  const n = await organized(id)
  return [n?.tags, ...(n?.conflicts ?? []).map((c) => c.tags)].map((t) => (t ?? []).join(',')).sort()
}
const notebooks = async (id: string) => {
  const n = await organized(id)
  return [n?.notebook === undefined ? 'main: none' : `main: ${n.notebook?._ref}`, ...(n?.conflicts ?? []).map((c) => `copy: ${c.notebook === null ? 'none' : c.notebook?._ref}`)]
}
const pick = (page: Page) => page.getByTestId('notebook-pick')

async function shoot(page: Page, view: Locator, name: string) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({colorScheme})
    await view.screenshot({path: test.info().outputPath(`${name}-${colorScheme}.png`)})
  }
  await page.emulateMedia({colorScheme: 'light'})
}

async function addTag(page: Page, tag: string) {
  await page.getByTestId('tag-add').fill(tag)
  await page.getByTestId('tag-add').press('Enter')
  await expect(tags(page).filter({hasText: tag})).toHaveCount(1)
}

test('two devices tag or move a note differently offline: both tags and notebooks reach Barkpark, a Studio unfile is kept as a version, and Keep this picks each', async ({browser, baseURL}) => {
  test.setTimeout(180_000)
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
  await expect(view.getByTestId('conflict-other').getByTestId('kb-tags')).toHaveText(`#${ta}`)
  await expect(view.getByTestId('conflict-mine').getByTestId('kb-tags')).toHaveText(`#${tb}`)
  await expect(view.getByTestId('kb-tags').first()).toHaveClass(/clash/)
  await expect(view.getByTestId('kb-notebook')).toHaveCount(0)
  await shoot(b, view, 'tags-copy')
  await view.getByTestId('keep-version').click()
  await expect(tags(b)).toHaveText([new RegExp(`#${ta}`)])
  await expect(view).toHaveCount(0)
  await expect.poll(() => tagSets(id), {timeout: 15_000}).toEqual([ta])
  await expect(tags(a)).toHaveText([new RegExp(`#${ta}`)], {timeout: 15_000})

  await Promise.all([a, b].map((p) => p.context().setOffline(true)))
  await pick(a).selectOption('fx-nb-home')
  await pick(b).selectOption('fx-nb-work')
  await a.context().setOffline(false)
  await synced(a)
  await expect.poll(() => notebooks(id), {timeout: 15_000}).toEqual(['main: fx-nb-home'])
  await b.context().setOffline(false)
  await synced(b)
  await expect.poll(() => notebooks(id), {timeout: 15_000}).toEqual(['main: fx-nb-work', 'copy: fx-nb-home'])
  await view.locator('summary').first().click()
  await expect(view.getByTestId('conflict-other').getByTestId('kb-notebook')).toHaveText('Home')
  await expect(view.getByTestId('conflict-mine').getByTestId('kb-notebook')).toHaveText('Work')
  await expect(view.getByTestId('kb-notebook').first()).toHaveClass(/clash/)
  await expect(view.getByTestId('kb-tags')).toHaveCount(0)
  await shoot(b, view, 'notebook-copy')
  await view.getByTestId('keep-version').click()
  await expect(pick(b)).toHaveValue('fx-nb-home')
  await expect.poll(() => notebooks(id), {timeout: 15_000}).toEqual(['main: fx-nb-home'])
  await expect(pick(a)).toHaveValue('fx-nb-home', {timeout: 15_000})

  await a.context().setOffline(true)
  await pick(a).selectOption('fx-nb-travel')
  const studio = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{patch: {id, type: 'note', unset: ['notebook']}}]})})
  expect(studio.ok).toBe(true)
  await a.context().setOffline(false)
  await synced(a)
  await expect.poll(() => notebooks(id), {timeout: 15_000}).toEqual(['main: fx-nb-travel', 'copy: none'])
  const onA = a.getByTestId('conflict')
  await onA.locator('summary').first().click()
  await expect(onA.getByTestId('conflict-other').getByTestId('kb-notebook')).toHaveText('No notebook')
  await onA.getByTestId('keep-version').click()
  await expect.poll(() => notebooks(id), {timeout: 15_000}).toEqual(['main: none'])
  await expect(pick(b)).toHaveValue('', {timeout: 15_000})
  expect(errors).toEqual([])
  await Promise.all([a.context().close(), b.context().close()])
})
