import {expect, test} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'
import {oldEditor} from './old-editor'
import {fixtures} from './seed'

const SHAPES = `note-shapes-${Date.now()}`
test.afterAll(() => deleteNotes([SHAPES]))

test('an editor older than contract 1.17.0 is refused once per page: the note reads only, and switching notes adds no editor files', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  await page.addInitScript(oldEditor)
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

test('the read-only body reads old and empty block shapes, and shows a link by its note\'s current title', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const linked = (fixtures().find((d) => d._id === 'fx-note-01') as {title: string}).title
  const text = (value: string) => ({type: 'text', value})
  const blocks = [
    {id: 'h', type: 'heading', level: 2, text: 'Old heading'},
    {id: 'h0', type: 'heading', level: 3},
    {id: 'p0', type: 'paragraph'},
    {id: 'p', type: 'paragraph', content: [text('See '), {type: 'wikilink', target: 'Old name', docId: 'fx-note-01', children: [text('Old name')]}, text(' and '), {type: 'strong'}, {type: 'strong', children: [text('bold')]}, text('.')]},
  ]
  const res = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{createOrReplace: {_id: SHAPES, _type: 'note', title: 'Old shapes', notebook: {_ref: 'fx-nb-inbox'}, tags: [], links: [], body: {blocks}}}]})})
  expect(res.status).toBe(200)
  await page.emulateMedia({colorScheme: 'dark'})
  await page.addInitScript(oldEditor)
  await page.goto(`/?n=${SHAPES}`)
  const body = page.getByTestId('body')
  await expect(body.locator('h2')).toHaveText('Old heading', {timeout: 30_000})
  await expect(body.locator('h3')).toHaveText('')
  await expect(body.locator('p')).toHaveText(['', `See ${linked} and bold.`])
  await expect(body.locator('a.wl')).toHaveAttribute('href', /n=fx-note-01/)
  await page.screenshot({path: test.info().outputPath('j05-guard-shapes-dark-1440.png')})
  expect(errors).toEqual([])
})
