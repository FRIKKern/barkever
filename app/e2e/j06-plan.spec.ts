import {expect, test, type Locator, type Page} from '@playwright/test'
import {lineKey, lineOf, type Spot} from '../src/lib/board'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'
import {serverNote} from './devices'
import {focusSettled, lineAtCaret} from './caret'

test.describe.configure({mode: 'serial', timeout: 120_000})

const KICKOFF = 'fx-note-00'
const KICKOFF_LINE = lineKey('fx-note-00-t', 3, {text: 'Share the timeline'}, 0)
const TITLE = 'Post office run'
const TASK = 'Buy stamps'
const SUB = 'Ask for a receipt'
const ABOVE = 'Weigh the parcel'
const REMOTE = 'Parcel to Bergen'
const NESTED = 'Buy packing tape'
const FILLER = 40
const created: string[] = []
let made = {id: '', line: ''}
test.afterAll(() => deleteNotes(created))

const search = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)
const opened = (page: Page) => search(page).n
const head = (page: Page) => page.getByTestId('board-head')
const task = (page: Page, text: string) => page.getByTestId('task').filter({hasText: text})
const rowOf = (page: Page, text: string) => task(page, text).locator('..')
const box = (page: Page, text: string) => page.getByRole('checkbox', {name: text, exact: true})
const synced = (page: Page) => expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 30_000})
const editable = (page: Page) => page.getByTestId('canvas').locator('[contenteditable="true"]')

const tally = async (page: Page) => {
  const [, open, done, lists] = (await head(page).innerText()).match(/(\d+) open · (\d+) done · from (\d+) checklist/)!
  return {open: Number(open), done: Number(done), lists: Number(lists)}
}
const tallied = (page: Page, t: {open: number; done: number; lists: number}) => expect(head(page)).toContainText(`${t.open} open · ${t.done} done · from ${t.lists} checklist`)

const spotOf = (line: string | Spot): Spot => (typeof line === 'string' ? lineOf(line)! : line)
const lineAt = (page: Page, line: string | Spot, live = true) => {
  const at = spotOf(line)
  return (live ? page.getByTestId('canvas') : page.getByTestId('body').locator('.blocks')).locator(`[data-bp-id=${JSON.stringify(at.block)}] > li:nth-child(${at.item + 1})`).filter({visible: true})
}
const linkOf = async (l: Locator) => new URL((await l.getAttribute('href'))!, 'http://x').searchParams.get('line')!

const markColour = (page: Page) =>
  page.evaluate(() => {
    const probe = document.body.appendChild(Object.assign(document.createElement('div'), {style: 'background: var(--c-mark)'}))
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  })

async function atLine(page: Page, line: string | Spot, live = true) {
  await expect(lineAt(page, line, live)).toHaveCount(1)
  await expect(lineAt(page, line, live)).toBeInViewport()
  await expect(lineAt(page, line, live)).toHaveCSS('background-color', await markColour(page))
}

type Stored = {_id: string; body?: {blocks: {type: string; task?: boolean; items?: {checked?: boolean; content?: {value?: string}[]}[]}[]}}

async function checklistOnServer(id: string) {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=drafts&limit=2&filter[_id][in]=${id},drafts.${id}`)
  const docs = ((await res.json()) as {result: {documents: Stored[]}}).result.documents
  const doc = docs.find((d) => d._id.startsWith('drafts.')) ?? docs[0]
  return (doc?.body?.blocks ?? []).filter((b) => b.type === 'list' && b.task).flatMap((b) => (b.items ?? []).map((it) => `${it.checked ? 'x' : 'o'} ${(it.content ?? []).map((c) => c.value).join('')}`))
}

test('J06 plan: checklist lines are cards on the Tasks board; a card opens its note at that line; ticks and deletes reach the board', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 30_000})

  await page.getByTestId('side-tasks').click()
  expect(search(page)).toEqual({view: 'tasks'})
  await expect(page.getByTestId('side-tasks')).toHaveClass(/\bon\b/)
  await expect(page.getByTestId('side-all')).not.toHaveClass(/\bon\b/)
  const before = await tally(page)
  await expect(page.getByTestId('side-tasks').locator('.n')).toHaveText(String(before.open))
  await expect(page.getByTestId('board-column').locator('.col-h b')).toHaveText(['Home', 'Inbox', 'Travel', 'Work', 'Meetings', 'Projects'])
  await expect(page.getByTestId('task-card')).toHaveCount(before.lists)
  await expect(rowOf(page, 'Share the timeline')).not.toHaveClass(/\bdone\b/)
  await expect(box(page, 'Share the timeline')).toHaveAttribute('aria-checked', 'false')
  await expect(rowOf(page, 'Draft the sitemap')).toHaveClass(/\bdone\b/)
  await expect(box(page, 'Draft the sitemap')).toHaveAttribute('aria-checked', 'true')
  const home = page.getByTestId('board-column').filter({has: page.locator('.col-h b', {hasText: /^Home$/})})
  const [done, all] = [await home.locator('.tk.done').count(), await home.getByTestId('task').count()]
  const [bar, track] = await Promise.all([home.locator('.prog i'), home.locator('.prog')].map((l) => l.evaluate((e) => e.getBoundingClientRect().width)))
  expect(done * 2).not.toBe(all)
  expect(bar / track).toBeCloseTo(done / all, 2)
  const homeDot = await page.getByTestId('side-notebook').filter({hasText: /^Home/}).locator('.dot').evaluate((e) => getComputedStyle(e).backgroundColor)
  await expect(home.locator('.col-h .dot')).toHaveCSS('background-color', homeDot)
  await expect(home.locator('.prog i')).toHaveCSS('background-color', homeDot)
  await page.screenshot({path: test.info().outputPath('j06-board-dark-1440.png')})

  await task(page, 'Share the timeline').click()
  expect(search(page)).toEqual({n: KICKOFF, line: KICKOFF_LINE})
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: kickoff')
  await atLine(page, KICKOFF_LINE)
  await expect(lineAt(page, KICKOFF_LINE).locator('p')).toHaveText('Share the timeline')
  await page.goBack()
  expect(search(page)).toEqual({view: 'tasks'})
  await tallied(page, before)

  await page.keyboard.press('ControlOrMeta+n')
  await expect(page.getByTestId('title')).toBeFocused()
  const id = opened(page)
  created.push(id)
  await page.keyboard.type(TITLE)
  await page.keyboard.press('Enter')
  await expect(editable(page)).toBeFocused()
  for (let i = 1; i <= FILLER; i++) {
    await page.keyboard.type(`Filler line ${i}`)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.type(`[ ] ${TASK}`)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type(SUB)
  await expect(page.getByTestId('canvas').locator('[data-type="taskList"] li p')).toHaveText([TASK, SUB])
  await synced(page)
  await expect.poll(() => checklistOnServer(id), {timeout: 30_000}).toEqual([`o ${TASK}`])

  await page.getByTestId('side-tasks').click()
  await tallied(page, {open: before.open + 2, done: before.done, lists: before.lists + 1})
  const inbox = page.getByTestId('board-column').filter({has: page.locator('.col-h b', {hasText: /^Inbox$/})})
  await expect(inbox.getByTestId('task-card').filter({hasText: TITLE}).getByTestId('task')).toHaveText([new RegExp(TASK), new RegExp(SUB)])
  await expect(rowOf(page, SUB)).toHaveClass(/\bsub\b/)
  await expect(rowOf(page, TASK)).not.toHaveClass(/\bsub\b/)
  await expect(task(page, TASK)).toHaveAccessibleName(TASK)
  await expect(box(page, TASK)).toHaveAttribute('aria-checked', 'false')
  const parentLine = new URL(await task(page, TASK).getAttribute('href') ?? '', 'http://x').searchParams.get('line')
  expect(new URL(await task(page, SUB).getAttribute('href') ?? '', 'http://x').searchParams.get('line')).toBe(parentLine)

  await task(page, TASK).click()
  expect(opened(page)).toBe(id)
  const line = search(page).line
  expect(line).toMatch(/.:0:[0-9a-z]+:0$/)
  made = {id, line}
  await atLine(page, line)
  await page.screenshot({path: test.info().outputPath('j06-at-line-dark-1440.png')})

  await lineAt(page, line).locator('input[type="checkbox"]').first().click()
  await expect(lineAt(page, line)).toHaveAttribute('data-checked', 'true')
  await synced(page)
  await expect.poll(() => checklistOnServer(id), {timeout: 30_000}).toEqual([`x ${TASK}`])
  await page.getByTestId('side-tasks').click()
  await tallied(page, {open: before.open + 1, done: before.done + 1, lists: before.lists + 1})
  await expect(rowOf(page, TASK)).toHaveClass(/\bdone\b/)
  await expect(box(page, TASK)).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('task-card').filter({hasText: TITLE}).getByRole('link', {name: TITLE}).click()
  expect(search(page)).toEqual({n: id})
  await page.goBack()
  await task(page, TASK).click()
  expect(search(page)).toEqual({n: id, line})

  await lineAt(page, line).locator('p').first().click({position: {x: 1, y: 4}})
  await page.keyboard.type(ABOVE)
  await expect.poll(() => search(page).line).toBeUndefined()
  await expect(page.getByTestId('line-gone')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('canvas').locator('[data-type="taskList"] li p')).toHaveText([ABOVE, TASK, SUB])
  await expect(page.getByTestId('line-gone')).toHaveCount(0)
  await synced(page)
  await page.getByTestId('side-tasks').click()
  await expect(page.getByTestId('task-card').filter({hasText: TITLE}).getByTestId('task')).toHaveText([new RegExp(ABOVE), new RegExp(TASK), new RegExp(SUB)])
  const fresh = await linkOf(task(page, TASK))
  expect(spotOf(fresh)).toEqual({...spotOf(line), item: 1})
  await task(page, TASK).click()
  await atLine(page, fresh)
  await page.goto(`/?n=${id}&line=${encodeURIComponent(line)}`)
  await atLine(page, fresh)
  await expect(lineAt(page, fresh).locator('p').first()).toHaveText(TASK)
  await expect(lineAt(page, line)).not.toHaveCSS('background-color', await markColour(page))
  await page.locator(`[data-testid="note-row"][data-note-id="${KICKOFF}"]`).click()
  expect(search(page)).toEqual({n: KICKOFF})
  expect(errors).toEqual([])
})

test.describe('with the editor blocked', () => {
  test.use({serviceWorkers: 'block'})

  test('J06 with no editor: a line opens marked in the read-only body; deleting the note takes its card off the board', async ({page}) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route('**/editor-files', (r) => r.fulfill({status: 503, body: 'unavailable'}))
    await page.emulateMedia({colorScheme: 'dark'})
    await page.goto('/?view=tasks')
    await expect(task(page, TASK)).toBeVisible({timeout: 30_000})
    const before = await tally(page)
    const card = page.getByTestId('task-card').filter({hasText: TITLE})
    const [cardDone, cardAll] = [await card.locator('.tk.done').count(), await card.getByTestId('task').count()]
    const fresh = await linkOf(task(page, TASK))

    await task(page, TASK).click()
    expect(search(page)).toEqual({n: made.id, line: fresh})
    await expect(page.getByTestId('body')).toContainText('Read only: the editor could not load')
    await expect(page.getByTestId('canvas')).toHaveCount(0)
    await atLine(page, fresh, false)
    await expect(lineAt(page, fresh, false).locator(':scope > .li-t')).toHaveText(TASK)

    await page.getByTestId('delete-note').click()
    await expect.poll(() => opened(page)).toBeUndefined()
    await page.getByTestId('side-tasks').click()
    await tallied(page, {open: before.open - (cardAll - cardDone), done: before.done - cardDone, lists: before.lists - 1})
    await expect(task(page, TASK)).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

test('J06 remote: a line added above moves the mark with its own line, twins and a bold line too; a checklist deleted while the board is open takes its card, and its old link says the line is gone', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  const id = `j06-remote-${Date.now()}`
  created.push(id)
  const block = 'rl"] , body { display: none } [a="'
  const item = (value: string) => ({content: [{type: 'text', value}], checked: false})
  const pack = {content: [{type: 'strong', children: [{type: 'text', value: 'Pack'}]}, {type: 'text', value: ' the box'}], checked: false}
  const body = (items?: unknown[]) => ({blocks: [{id: `${id}-p0`, type: 'paragraph', content: [{type: 'text', value: 'Ship it Friday.'}]}, ...(items ? [{id: block, type: 'list', task: true, items}] : [])]})
  const write = async (mutations: unknown[]) => expect((await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations})})).ok).toBe(true)
  await write([{createOrReplace: {_id: id, _type: 'note', title: REMOTE, notebook: {_type: 'reference', _ref: 'fx-nb-inbox'}, tags: [], links: [], body: body([item('Print the label'), pack, item('Print the label')])}}, {publish: {id, type: 'note'}}])

  await page.goto('/?view=tasks')
  await expect(task(page, 'Print the label')).toHaveCount(2, {timeout: 30_000})
  const twin = task(page, 'Print the label').nth(1)
  const old = await linkOf(twin)
  expect(spotOf(old)).toMatchObject({block, item: 2, nth: 1})
  await twin.click()
  await atLine(page, old)
  await expect(page.locator('body')).toBeVisible()

  await write([{patch: {id, type: 'note', set: {body: body([item('Find the address'), item('Print the label'), pack, item('Print the label')])}}}])
  await expect(page.getByTestId('canvas').locator('[data-type="taskList"] li p')).toHaveText(['Find the address', 'Print the label', 'Pack the box', 'Print the label'], {timeout: 15_000})
  expect(search(page).line).toBe(old)
  await atLine(page, {block, item: 3})
  await expect(lineAt(page, old)).not.toHaveCSS('background-color', await markColour(page))

  await page.goBack()
  await expect(page.getByTestId('task-card').filter({hasText: REMOTE}).getByTestId('task')).toHaveText([/Find the address/, /Print the label/, /Pack the box/, /Print the label/])
  const bold = await linkOf(task(page, 'Pack the box'))
  expect(spotOf(bold)).toMatchObject({block, item: 2, nth: 0})
  await task(page, 'Pack the box').click()
  await atLine(page, bold)
  await expect(lineAt(page, bold).locator('p strong')).toHaveText('Pack')
  await page.goBack()
  const before = await tally(page)
  await write([{patch: {id, type: 'note', set: {body: body()}}}])
  await expect(page.getByTestId('task-card').filter({hasText: REMOTE})).toHaveCount(0, {timeout: 15_000})
  await tallied(page, {open: before.open - 4, done: before.done, lists: before.lists - 1})

  await page.goto(`/?n=${id}&line=${encodeURIComponent(old)}`)
  await expect(page.getByTestId('title')).toHaveValue(REMOTE, {timeout: 30_000})
  await expect(page.getByTestId('line-gone')).toHaveText('That line has moved or been deleted.')
  await expect(page.getByTestId('body').locator('style')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('J06 on a phone, offline: the board stacks its columns, a line opens marked, Back says Tasks and returns; a deep link opens at its line, one to no line opens the note', async ({page, context}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`/?n=${KICKOFF}&line=nowhere:0:abc:0`)
  await expect(page.getByTestId('canvas')).toBeVisible({timeout: 30_000})
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: kickoff')
  await expect(page.getByTestId('line-gone')).toBeVisible()
  await page.goto(`/?n=${KICKOFF}&line=${KICKOFF_LINE}`)
  await atLine(page, KICKOFF_LINE)
  await synced(page)

  await page.goto('/?view=tasks')
  await expect(page.getByTestId('board-column').first()).toBeVisible({timeout: 30_000})
  const [a, b] = await page.getByTestId('board-column').evaluateAll((cols) => cols.slice(0, 2).map((c) => c.getBoundingClientRect()))
  expect(b.top).toBeGreaterThan(a.bottom - 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(task(page, 'Share the timeline').locator('.go')).toBeHidden()
  await page.screenshot({path: test.info().outputPath('j06-board-dark-390.png'), fullPage: true})

  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toBeVisible({timeout: 15_000})
  await task(page, 'Share the timeline').click()
  expect(search(page)).toEqual({n: KICKOFF, line: KICKOFF_LINE})
  await atLine(page, KICKOFF_LINE)
  await page.screenshot({path: test.info().outputPath('j06-at-line-dark-390.png')})

  const back = page.locator('.editor .mhead .back')
  await expect(back).toHaveText('Tasks')
  await back.click()
  expect(search(page)).toEqual({view: 'tasks'})
  await page.getByRole('button', {name: 'Notebooks'}).click()
  await expect(page.getByTestId('side-tasks')).toHaveClass(/\bon\b/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', {name: 'Notebooks'})).toBeFocused()
  await context.setOffline(false)
  expect(errors).toEqual([])
})

test('J06 nested only: an untitled note whose only words sit in a nested checklist line stays when I leave it and reload, and that line is on the board', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await expect(page.getByTestId('new-note').first()).toBeEnabled({timeout: 30_000})
  await page.keyboard.press('n')
  await expect(page.getByTestId('title')).toBeFocused()
  const id = opened(page)
  created.push(id)
  await expect(editable(page)).toBeAttached()
  await page.keyboard.press('Enter')
  await page.keyboard.type('[ ] x')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type(NESTED)
  await expect.poll(() => lineAtCaret(page)).toBe(NESTED)
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => lineAtCaret(page), 'the caret moved up to the parent line').toBe('x')
  await focusSettled(page)
  await page.keyboard.press('End')
  await page.keyboard.press('Backspace')
  await expect(page.getByTestId('canvas').locator('[data-type="taskList"] li p')).toHaveText(['', NESTED])
  await expect(page.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
  await synced(page)

  await page.getByTestId('side-tasks').click()
  const card = page.getByTestId('task-card').filter({has: page.locator(`a.card-t[href*="n=${id}"]`)})
  await expect(card.locator('.card-t')).toHaveText('Untitled')
  await expect(card.getByTestId('task')).toHaveText([new RegExp(NESTED)])
  await expect(card.getByTestId('task').locator('..')).toHaveClass(/\bsub\b/)
  await page.reload()
  await expect(card.getByTestId('task')).toHaveText([new RegExp(NESTED)], {timeout: 30_000})
  expect(JSON.stringify((await serverNote(id))?.body?.blocks)).toContain(NESTED)

  const line = await linkOf(card.getByTestId('task'))
  expect(spotOf(line)).toMatchObject({item: 0, nth: 0})
  await card.getByTestId('task').click()
  await atLine(page, line)
  await expect(lineAt(page, line).locator('[data-type="taskList"] li p')).toHaveText(NESTED)
  await page.goto('/')
  await expect(page.locator(`[data-testid="note-row"][data-note-id="${id}"]`)).toHaveCount(1, {timeout: 30_000})
  expect(errors).toEqual([])
})
