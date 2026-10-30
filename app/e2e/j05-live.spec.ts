import {expect, test, type Page} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'

test.describe.configure({mode: 'serial', timeout: 150_000})

const TARGET = 'Tide gauge: spring check'
const RENAMED = 'Tide gauge: autumn check'
const SOURCE = 'Pier walk: what to check'
const CRANE = 'Harbour crane: load test'
const SPOTS = [
  ['inside the picked link', 'then the rest.', 'end', ' then the rest.'.length + 1, 0, 'inside'],
  ['right after the picked link', 'then the rest.', 'end', ' then the rest.'.length, 0, 'end'],
  ['just left of the picked link', 'then the rest.', 'start', 'First '.length, 0, 'start'],
  ['right after the typed link', 'again here.', 'end', ' again here.'.length, 1, 'end'],
  ['line start, before the typed link', 'again here.', 'start', 0, 1, 'start'],
] as const
const BESIDE = SPOTS.slice(1)
const HUMAN_KEY_MS = 30
const created: string[] = []
test.afterAll(() => deleteNotes(created))

type Stored = Record<string, unknown> & {_id: string}

const opened = (page: Page) => new URL(page.url()).searchParams.get('n')
const links = (page: Page) => page.getByTestId('canvas').locator('[data-wikilink]')
const synced = (page: Page) => expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 30_000})
const shown = (page: Page) => links(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText))

async function onServer(id: string): Promise<Stored | undefined> {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=drafts&limit=2&filter[_id][in]=${id},drafts.${id}`)
  const docs = ((await res.json()) as {result: {documents: Stored[]}}).result.documents
  return docs.find((d) => d._id.startsWith('drafts.')) ?? docs[0]
}

async function recreate(doc: Stored) {
  const {_rev, _updatedAt, _createdAt, ...content} = doc
  const res = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{createOrReplace: content}]})})
  expect(res.status).toBe(200)
}

async function newNote(page: Page, title: string) {
  const before = opened(page)
  await page.keyboard.press('ControlOrMeta+n')
  await expect(page.getByTestId('title')).toBeFocused()
  await expect.poll(() => opened(page)).not.toBe(before)
  created.push(opened(page)!)
  await page.keyboard.type(title)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('canvas').locator('[contenteditable="true"]')).toBeFocused()
  return opened(page)!
}

const caretBy = (page: Page, n: number) =>
  page.evaluate((n) => {
    const host = document.querySelector('bp-paper-canvas [contenteditable="true"]') as HTMLElement & {editor: {view: {posAtDOM(node: Node, offset: number): number}}}
    const {view} = host.editor
    const words = document.createTreeWalker(host.querySelectorAll('[data-wikilink]')[n], NodeFilter.SHOW_TEXT).nextNode()!
    const [start, end] = [view.posAtDOM(words, 0), view.posAtDOM(words, words.textContent!.length)]
    const r = getSelection()!.getRangeAt(0)
    const at = view.posAtDOM(r.startContainer, r.startOffset)
    return at === start ? 'start' : at === end ? 'end' : at > start && at < end ? 'inside' : `at ${at}, link ${start}-${end}`
  }, n)

async function caretAt(page: Page, text: string, edge: 'start' | 'end', steps: number) {
  const line = page.getByTestId('canvas').locator('p', {hasText: text})
  const box = (await line.boundingBox())!
  await line.click({position: {x: box.width - 2, y: box.height / 2}})
  if (edge === 'start') await page.keyboard.press('ControlOrMeta+ArrowLeft', {delay: HUMAN_KEY_MS})
  for (let i = 0; i < steps; i++) await page.keyboard.press(edge === 'start' ? 'ArrowRight' : 'ArrowLeft', {delay: HUMAN_KEY_MS})
}

async function followFromEverySpot(page: Page, spots: typeof BESIDE | typeof SPOTS, from: string, to: string, when: string) {
  for (const [spot, text, edge, steps, link, side] of spots) {
    await caretAt(page, text, edge, steps)
    expect(await caretBy(page, link), `caret ${spot}, ${when}`).toBe(side)
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect.poll(() => opened(page), {message: `Mod+Enter ${spot}, ${when}`}).toBe(to)
    await page.goBack()
    await expect.poll(() => opened(page)).toBe(from)
  }
}

async function paste(page: Page, text: string) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text)
  await page.keyboard.press('ControlOrMeta+v')
}

test('J05 live titles: a typed [[Title]] links, a rename repaints every link, the list line, search line, backlink line and graph tip without writing the linking note, Mod+Enter inside or on either side of a picked or typed link, before and after a rename, follows it, and a delete and a recreate mark and unmark it', async ({browser}) => {
  const context = await browser.newContext({storageState: test.info().project.use.storageState, colorScheme: 'dark'})
  const [page, other] = [await context.newPage(), await context.newPage()]
  const errors: string[] = []
  for (const p of [page, other]) p.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 30_000})

  const target = await newNote(page, TARGET)
  await page.keyboard.type('Read the gauge at low water.')
  await synced(page)
  const source = await newNote(page, SOURCE)
  await page.keyboard.type('First [[tide gau')
  await expect(page.locator('.bp-wikilink-item').first()).toContainText(TARGET)
  await page.keyboard.press('Enter')
  await page.keyboard.type('then the rest.')
  await page.keyboard.press('Enter')
  await page.keyboard.type(`[[${TARGET.toUpperCase()}]] again here.`)
  await expect(links(page)).toHaveCount(2)
  await expect.poll(() => shown(page)).toEqual([TARGET, TARGET])
  await synced(page)
  await expect.poll(async () => JSON.stringify((await onServer(source))?.links), {timeout: 30_000}).toContain(target)
  const stored = JSON.stringify((await onServer(source))?.body)
  await followFromEverySpot(page, SPOTS, source, target, 'before a rename')

  await other.goto(`/?n=${target}`)
  await expect(other.getByTestId('title')).toHaveValue(TARGET, {timeout: 30_000})
  await other.getByTestId('title').fill(RENAMED)
  await expect.poll(() => shown(page), {timeout: 15_000}).toEqual([RENAMED, RENAMED])
  await synced(other)
  await synced(page)
  expect(JSON.stringify((await onServer(source))?.body)).toBe(stored)
  await page.screenshot({path: test.info().outputPath('j05-live-title-dark-1440.png')})

  const line = `First ${RENAMED} then the rest.`
  await expect(page.getByTestId('note-row').filter({hasText: SOURCE}).locator('.row-snip')).toHaveText(line)
  await expect(other.getByTestId('linked-from').filter({hasText: SOURCE})).toContainText(line)
  await other.getByTestId('graph-node').first().hover()
  await expect(other.getByTestId('graph-tip')).toContainText(line)
  await other.screenshot({path: test.info().outputPath('j05-live-plain-title-dark-1440.png'), animations: 'disabled'})
  await page.getByTestId('search').fill('rest')
  await expect(page.getByTestId('note-row').filter({hasText: SOURCE}).locator('.row-snip')).toHaveText(line)
  await page.getByTestId('search').fill('')
  await expect.poll(() => opened(page)).toBe(source)
  expect(JSON.stringify((await onServer(source))?.body)).toBe(stored)

  await followFromEverySpot(page, BESIDE, source, target, 'after a rename, where a painted link never holds the caret')
  await expect.poll(() => shown(page)).toEqual([RENAMED, RENAMED])

  const before = (await onServer(target))!
  await other.getByTestId('delete-note').click()
  await expect(links(page).first()).toHaveAttribute('data-missing', {timeout: 15_000})
  await expect(links(page).nth(1)).toHaveAttribute('data-missing')
  await expect.poll(() => shown(page)).toEqual([TARGET, TARGET])
  await links(page).first().hover()
  await expect(page.locator('.bp-link-preview__title')).toHaveText('Deleted note')
  await expect(page.locator('.bp-link-preview__open')).toBeHidden()
  await page.screenshot({path: test.info().outputPath('j05-live-missing-dark-1440.png'), animations: 'disabled'})
  await page.mouse.move(0, 0)
  await page.setViewportSize({width: 390, height: 844})
  await page.screenshot({path: test.info().outputPath('j05-live-missing-dark-390.png')})

  await recreate(before)
  await expect(links(page).first()).not.toHaveAttribute('data-missing', {timeout: 20_000})
  await expect.poll(() => shown(page)).toEqual([RENAMED, RENAMED])
  expect(JSON.stringify((await onServer(source))?.body)).toBe(stored)
  await page.screenshot({path: test.info().outputPath('j05-live-title-dark-390.png')})
  expect(errors).toEqual([])
  await context.close()
})

test('J05 paste: a pasted [[Exact title]] links to that note, as plain text and as Markdown; an unknown title stays text', async ({browser}) => {
  const context = await browser.newContext({storageState: test.info().project.use.storageState, colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write']})
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 30_000})

  const crane = await newNote(page, CRANE)
  await page.keyboard.type('Check the hook first.')
  await synced(page)
  const source = await newNote(page, 'Crane day: pasted links')
  await page.keyboard.type('Plain ')
  await paste(page, `[[${CRANE}]]`)
  await page.keyboard.type(' done.')
  await page.keyboard.press('Enter')
  await paste(page, `[[No note has this title]]`)
  await page.keyboard.press('Enter')
  await paste(page, `- Markdown [[${CRANE}]] item\n- second item`)
  await expect(links(page)).toHaveCount(2)
  expect(await links(page).evaluateAll((els) => els.map((e) => e.getAttribute('docid')))).toEqual([crane, crane])
  await expect(page.getByTestId('canvas').locator('li', {hasText: 'Markdown'}).locator('[data-wikilink]')).toHaveCount(1)
  await expect(page.getByTestId('canvas')).toContainText('[[No note has this title]]')
  await synced(page)
  await expect.poll(async () => JSON.stringify((await onServer(source))?.links), {timeout: 30_000}).toContain(crane)
  await page.screenshot({path: test.info().outputPath('j05-paste-dark-1440.png')})
  expect(errors).toEqual([])
  await context.close()
})
