import {expect, test, type Page} from '@playwright/test'
import {deleteNotes} from './fixtures-cleanup'
import {canvas, created, newNote, serverNote, status, synced} from './devices'
import {oldEditor} from './old-editor'

test.describe.configure({mode: 'serial', timeout: 120_000})
test.afterAll(() => deleteNotes(created))

const TARGET = 'Mooring: winter plan'
const SHED = 'Harbor shed: tools'
const LINE = `Rope and chain, knot then ${TARGET}`
const row = (page: Page, title: string) => page.getByTestId('note-row').filter({hasText: title})
const body = (id: string) => serverNote(id).then((n) => JSON.stringify(n?.body))

async function toggled(page: Page, key: string, words: string) {
  await page.keyboard.press(`ControlOrMeta+${key}`)
  await page.keyboard.type(words)
  await page.keyboard.press(`ControlOrMeta+${key}`)
}

test('J05 marks: an untitled note whose only text is bold stays when I leave it', async ({page}) => {
  await page.goto('/')
  await expect(page.getByTestId('new-note')).toBeEnabled()
  await page.keyboard.press('n')
  await expect(page.getByTestId('title')).toBeFocused()
  const id = new URL(page.url()).searchParams.get('n')!
  created.push(id)
  await expect(canvas(page).locator('[contenteditable="true"]')).toBeAttached()
  await page.keyboard.press('Enter')
  await toggled(page, 'b', 'Buy rope')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await page.goBack()
  await synced(page)
  const kept = await serverNote(id)
  expect(kept, 'the bold-only note is still on Barkpark').toBeDefined()
  expect(kept!.body!.blocks[0].content).toEqual([{type: 'strong', children: [{type: 'text', value: 'Buy rope'}]}])
  await page.reload()
  await expect(page.locator(`[data-testid="note-row"][data-note-id="${id}"] .row-snip`)).toHaveText('Buy rope', {timeout: 30_000})
})

test('J05 marks: bold, italic and code words show in the list line, search, the backlink line, the graph tip, the link card and the read-only body', async ({browser}) => {
  const context = await browser.newContext({storageState: test.info().project.use.storageState, colorScheme: 'dark'})
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  const target = await newNote(page, TARGET, 'Check the chains.')
  const shed = await newNote(page, SHED, '')
  await toggled(page, 'b', 'Rope')
  await page.keyboard.type(' and ')
  await toggled(page, 'i', 'chain')
  await page.keyboard.type(', `knot` then [[Mooring: win')
  await expect(page.locator('.bp-wikilink-item').first()).toContainText(TARGET)
  await page.keyboard.press('Enter')
  await synced(page)
  await expect.poll(() => body(shed), {timeout: 30_000}).toContain('"type":"wikilink"')
  const stored = await body(shed)
  for (const type of ['strong', 'em', 'code', 'wikilink']) expect(stored).toContain(`"type":"${type}"`)

  await expect(row(page, SHED).locator('.row-snip')).toHaveText(LINE)
  for (const word of ['rope', 'chain', 'knot']) {
    await page.getByTestId('search').fill(word)
    await expect(row(page, SHED).locator('.row-snip'), word).toHaveText(LINE)
  }
  await page.getByTestId('search').fill('')

  await page.goto(`/?n=${target}`)
  await expect(page.getByTestId('linked-from').filter({hasText: SHED})).toContainText(LINE, {timeout: 30_000})
  await page.locator(`[data-testid="graph-node"][data-id="${shed}"]`).hover()
  await expect(page.getByTestId('graph-tip')).toContainText(LINE)
  await page.screenshot({path: test.info().outputPath('j05-marks-dark-1440.png'), animations: 'disabled'})

  await canvas(page).locator('p', {hasText: 'Check the chains.'}).click({position: {x: 10, y: 10}})
  await page.keyboard.press('End')
  await page.keyboard.type(' See [[Harbor sh')
  await expect(page.locator('.bp-wikilink-item').first()).toContainText(SHED)
  await page.keyboard.press('Enter')
  await canvas(page).locator('[data-wikilink]').hover()
  await expect(page.locator('.bp-link-preview__excerpt')).toHaveText(LINE)
  await page.screenshot({path: test.info().outputPath('j05-marks-card-dark-1440.png'), animations: 'disabled'})
  await page.mouse.move(0, 0)
  await page.setViewportSize({width: 390, height: 844})
  await page.screenshot({path: test.info().outputPath('j05-marks-dark-390.png')})

  const reader = await context.newPage()
  reader.on('pageerror', (e) => errors.push(e.message))
  await reader.addInitScript(oldEditor)
  await reader.goto(`/?n=${shed}`)
  await expect(reader.getByTestId('body').locator('p')).toHaveText(LINE, {timeout: 30_000})
  expect(errors).toEqual([])
  await context.close()
})
