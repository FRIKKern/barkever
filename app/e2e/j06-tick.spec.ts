import {expect, test, type Locator, type Page} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'
import {canvas, device, errorsOf, serverNote, synced, typeAtEndOf, type ServerNote} from './devices'

test.describe.configure({mode: 'serial', timeout: 120_000})

const TITLE = 'Bike day'
const PUMP = 'Pump the tyres'
const OIL = 'Oil the chain'
const RAG = 'Wipe the rag'
const created: string[] = []
test.afterAll(() => deleteNotes(created))

const cardOf = (page: Page, id: string) => page.getByTestId('task-card').filter({has: page.locator(`a.card-t[href*="n=${id}"]`)})
const box = (card: Locator, words: string) => card.getByRole('checkbox', {name: words, exact: true})
const row = (card: Locator, words: string) => card.getByTestId('task').filter({hasText: words})
const head = (page: Page) => page.getByTestId('board-head')
const tally = async (page: Page) => {
  const [, open, done] = (await head(page).innerText()).match(/(\d+) open · (\d+) done/)!
  return {open: Number(open), done: Number(done)}
}

type Item = {content?: {value?: string}[]; checked?: boolean; children?: {items?: Item[]}[]}
const words = (it: Item) => (it.content ?? []).map((c) => c.value).join('')
const ticks = (n: ServerNote | undefined) => {
  const list = n?.body?.blocks.find((b) => b.type === 'list' && b.task) as {items?: Item[]} | undefined
  return (list?.items ?? []).flatMap((it) => [`${it.checked ? 'x' : 'o'} ${words(it)}`, ...(it.children ?? []).flatMap((c) => (c.items ?? []).map((k) => `  ${k.checked ? 'x' : 'o'} ${words(k)}`))])
}

async function bikeDay(id: string) {
  const item = (value: string, children?: unknown[]) => ({content: [{type: 'text', value}], checked: false, ...(children && {children})})
  const body = {blocks: [{id: `${id}-c`, type: 'list', task: true, items: [item(PUMP), item(OIL, [{id: `${id}-n`, type: 'list', task: true, items: [item(RAG)]}])]}]}
  const res = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{createOrReplace: {_id: id, _type: 'note', title: TITLE, notebook: {_type: 'reference', _ref: 'fx-nb-inbox'}, tags: [], links: [], body}}, {publish: {id, type: 'note'}}]})})
  expect(res.ok).toBe(true)
  created.push(id)
}

const blockPush = (page: Page, id: string) => page.route('**/_serverFn/**', (r) => ((r.request().postData() ?? '').includes(id) && (r.request().postData() ?? '').includes('checked') ? r.abort() : r.continue()))

test('J06 tick: a row box on the board ticks and unticks its line in the note, nested lines too, and reaches Barkpark; the words still open the note', async ({page}) => {
  const errors = errorsOf(page)
  const id = `j06-tick-${Date.now()}`
  await bikeDay(id)
  const card = cardOf(page, id)
  await page.goto('/?view=tasks')
  await expect(box(card, PUMP)).toHaveAttribute('aria-checked', 'false', {timeout: 30_000})
  const before = await tally(page)

  await box(card, PUMP).click()
  await expect(box(card, PUMP)).toHaveAttribute('aria-checked', 'true')
  await expect(row(card, PUMP).locator('..')).toHaveClass(/\bdone\b/)
  await expect(head(page)).toContainText(`${before.open - 1} open · ${before.done + 1} done`)
  expect(new URL(page.url()).searchParams.get('view')).toBe('tasks')
  await expect.poll(async () => ticks(await serverNote(id)), {timeout: 15_000}).toEqual([`x ${PUMP}`, `o ${OIL}`, `  o ${RAG}`])

  await box(card, RAG).focus()
  await page.keyboard.press('Space')
  await expect(box(card, RAG)).toHaveAttribute('aria-checked', 'true')
  await expect.poll(async () => ticks(await serverNote(id)), {timeout: 15_000}).toEqual([`x ${PUMP}`, `o ${OIL}`, `  x ${RAG}`])

  await row(card, PUMP).click()
  await expect(page.getByTestId('title')).toHaveValue(TITLE, {timeout: 30_000})
  await expect(canvas(page).locator(`[data-bp-id="${id}-c"] > li`).first()).toHaveAttribute('data-checked', 'true')
  await page.goBack()

  await box(card, PUMP).click()
  await expect(box(card, PUMP)).toHaveAttribute('aria-checked', 'false')
  await expect(head(page)).toContainText(`${before.open - 1} open · ${before.done + 1} done`)
  await expect.poll(async () => ticks(await serverNote(id)), {timeout: 15_000}).toEqual([`o ${PUMP}`, `o ${OIL}`, `  x ${RAG}`])
  await box(card, OIL).click({clickCount: 3})
  await expect(box(card, OIL)).toHaveAttribute('aria-checked', 'true')
  await expect.poll(async () => ticks(await serverNote(id)), {timeout: 15_000}).toEqual([`o ${PUMP}`, `x ${OIL}`, `  x ${RAG}`])
  await box(card, PUMP).evaluate((b: HTMLElement) => {
    b.click()
    b.click()
  })
  await box(card, PUMP).click()
  await expect.poll(async () => ticks(await serverNote(id)), {timeout: 15_000}).toEqual([`x ${PUMP}`, `x ${OIL}`, `  x ${RAG}`])
  await synced(page)
  await expect(box(card, PUMP)).toHaveAttribute('aria-checked', 'true')
  expect((await serverNote(id))?.conflicts ?? []).toEqual([])
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({colorScheme: scheme})
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({path: test.info().outputPath(`j06-tick-${scheme}-1440.png`)})
  }
  expect(errors).toEqual([])
})

test('J06 tick offline: a tick waits on the device, survives a reload, and reaches Barkpark when the line is back', async ({page, context}) => {
  const errors = errorsOf(page)
  const id = `j06-tick-off-${Date.now()}`
  await bikeDay(id)
  const card = cardOf(page, id)
  await page.goto('/?view=tasks')
  await expect(box(card, OIL)).toHaveAttribute('aria-checked', 'false', {timeout: 30_000})
  await synced(page)

  await blockPush(page, id)
  await box(card, OIL).click()
  await expect(box(card, OIL)).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await expect(box(card, OIL)).toHaveAttribute('aria-checked', 'true', {timeout: 30_000})
  expect(ticks(await serverNote(id))).toEqual([`o ${PUMP}`, `o ${OIL}`, `  o ${RAG}`])
  await page.unroute('**/_serverFn/**')
  await expect.poll(async () => ticks(await serverNote(id)), {timeout: 30_000}).toEqual([`o ${PUMP}`, `x ${OIL}`, `  o ${RAG}`])

  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toBeVisible({timeout: 15_000})
  await box(card, PUMP).click()
  await expect(box(card, PUMP)).toHaveAttribute('aria-checked', 'true')
  await context.setOffline(false)
  await expect.poll(async () => ticks(await serverNote(id)), {timeout: 30_000}).toEqual([`x ${PUMP}`, `x ${OIL}`, `  o ${RAG}`])
  expect(errors).toEqual([])
})

test('J06 tick clash: a tick made offline and words typed in the same checklist on another device keep both versions in the note', async ({page, context, browser, baseURL}) => {
  const errors = errorsOf(page)
  const id = `j06-tick-clash-${Date.now()}`
  await bikeDay(id)
  const card = cardOf(page, id)
  const other = await device(browser, baseURL!)
  errors.push(...errorsOf(other))
  await page.goto('/?view=tasks')
  await expect(box(card, PUMP)).toHaveAttribute('aria-checked', 'false', {timeout: 30_000})
  await synced(page)

  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toBeVisible({timeout: 15_000})
  await box(card, PUMP).click()
  await expect(box(card, PUMP)).toHaveAttribute('aria-checked', 'true')

  await other.goto(`/?n=${id}`)
  await expect(canvas(other)).toContainText(RAG, {timeout: 30_000})
  await typeAtEndOf(other, 0, ' twice')
  await expect.poll(async () => JSON.stringify((await serverNote(id))?.body), {timeout: 15_000}).toContain(`${RAG} twice`)

  await context.setOffline(false)
  await synced(page)
  await expect.poll(async () => ticks(await serverNote(id)), {timeout: 30_000}).toEqual([`x ${PUMP}`, `o ${OIL}`, `  o ${RAG}`])
  expect(JSON.stringify((await serverNote(id))?.conflicts)).toContain(`${RAG} twice`)
  await expect(box(card, PUMP)).toHaveAttribute('aria-checked', 'true')
  await row(card, PUMP).click()
  await expect(page.getByTestId('conflict').getByTestId('conflict-other').filter({hasText: `${RAG} twice`})).toHaveCount(1, {timeout: 15_000})
  expect(errors).toEqual([])
  await other.context().close()
})

test('J06 tick on a phone: the box is a 44 px target and ticks without opening the note', async ({page}) => {
  const id = `j06-tick-phone-${Date.now()}`
  await bikeDay(id)
  const card = cardOf(page, id)
  await page.setViewportSize({width: 390, height: 844})
  await page.goto('/?view=tasks')
  await expect(box(card, PUMP)).toBeVisible({timeout: 30_000})
  const size = (await box(card, PUMP).boundingBox())!
  expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(44)
  await box(card, PUMP).click()
  await expect(box(card, PUMP)).toHaveAttribute('aria-checked', 'true')
  expect(new URL(page.url()).searchParams.get('n')).toBeNull()
  await expect.poll(async () => ticks(await serverNote(id)), {timeout: 15_000}).toEqual([`x ${PUMP}`, `o ${OIL}`, `  o ${RAG}`])
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({colorScheme: scheme})
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({path: test.info().outputPath(`j06-tick-${scheme}-390.png`)})
  }
})
