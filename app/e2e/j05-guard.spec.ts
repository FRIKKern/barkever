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
    {id: 'h1', type: 'heading', level: 2, text: '', content: [{type: 'strong', children: [text('Saved empty, then bold')]}]},
    {id: 'h0', type: 'heading', level: 3},
    {id: 'h4', type: 'heading', level: 3, text: '', content: [text('Third level')]},
    {id: 'p0', type: 'paragraph'},
    {id: 'p', type: 'paragraph', content: [text('See '), {type: 'wikilink', target: 'Old name', docId: 'fx-note-01', children: [text('Old name')]}, text(' and '), {type: 'strong'}, {type: 'strong', children: [text('bold')]}, text('.')]},
    {id: 'pt', type: 'paragraph', text: 'Plain paragraph'},
    {id: 'pl', type: 'paragraph', content: [{type: 'text', text: 'Legacy leaf'}]},
    {id: 'pe', type: 'paragraph', content: [{type: 'text', value: '', text: 'Empty value'}]},
    {id: 'pv', type: 'paragraph', content: [{type: 'text', value: 'Value', text: 'Text'}]},
    {id: 'ls', type: 'list', items: ['String item', {content: [text('Top')], children: [{id: 'c', type: 'list', items: [[text('Nested item')]]}]}]},
    {id: 'lt', type: 'list', task: true, items: ['Open task', {content: [text('Done task')], checked: true, children: [{id: 'c2', type: 'list', task: true, items: ['Sub task']}]}]},
  ]
  const res = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{createOrReplace: {_id: SHAPES, _type: 'note', title: 'Old shapes', notebook: {_ref: 'fx-nb-inbox'}, tags: [], links: [], body: {blocks}}}]})})
  expect(res.status).toBe(200)
  await page.emulateMedia({colorScheme: 'dark'})
  await page.addInitScript(oldEditor)
  await page.goto(`/?n=${SHAPES}`)
  const body = page.getByTestId('body')
  await expect(body.locator('h2')).toHaveText(['Old heading', 'Saved empty, then bold'], {timeout: 30_000})
  await expect(body.locator('h3')).toHaveText(['', 'Third level'])
  await expect(body.locator('p')).toHaveText(['', `See ${linked} and bold.`, 'Plain paragraph', 'Legacy leaf', 'Empty value', 'Value'])
  await expect(body.locator('li')).toHaveText(['String item', 'TopNested item', 'Nested item', 'Open task', 'Done taskSub task', 'Sub task'])
  await expect(body.locator('li.done')).toHaveText('Done taskSub task')
  const [task, sub] = await Promise.all([body.locator('li.done .li-t'), body.getByText('Sub task')].map((l) => l.boundingBox()))
  expect(sub!.y, 'a nested item sits under its task, not beside it').toBeGreaterThan(task!.y + task!.height - 1)
  const open = await body.locator('li:not(.done) > .cb').first().evaluate((e) => getComputedStyle(e).backgroundColor)
  await expect(body.locator('li.done li .li-t'), 'an open sub-task under a done task is not struck through').toHaveCSS('text-decoration-line', 'none')
  await expect(body.locator('li.done li .cb'), 'an open sub-task under a done task has an open box').toHaveCSS('background-color', open)
  await expect(body.locator('a.wl')).toHaveAttribute('href', /n=fx-note-01/)
  await page.screenshot({path: test.info().outputPath('j05-guard-shapes-dark-1440.png')})
  await page.setViewportSize({width: 390, height: 844})
  await page.screenshot({path: test.info().outputPath('j05-guard-shapes-dark-390.png'), fullPage: true})
  expect(errors).toEqual([])
})
