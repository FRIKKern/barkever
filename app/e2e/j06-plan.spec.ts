import {expect, test, type Page} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'

test.describe.configure({mode: 'serial', timeout: 120_000})

const KICKOFF = 'fx-note-00'
const KICKOFF_LINE = 'fx-note-00-t:3'
const TITLE = 'Post office run'
const TASK = 'Buy stamps'
const SUB = 'Ask for a receipt'
const FILLER = 40
const created: string[] = []
let made = {id: '', line: ''}
test.afterAll(() => deleteNotes(created))

const search = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)
const opened = (page: Page) => search(page).n
const head = (page: Page) => page.getByTestId('board-head')
const task = (page: Page, text: string) => page.getByTestId('task').filter({hasText: text})
const synced = (page: Page) => expect(page.getByTestId('sync-status')).toHaveText('Synced', {timeout: 30_000})
const editable = (page: Page) => page.getByTestId('canvas').locator('[contenteditable="true"]')

const tally = async (page: Page) => {
  const [, open, done, lists] = (await head(page).innerText()).match(/(\d+) open · (\d+) done · from (\d+) checklist/)!
  return {open: Number(open), done: Number(done), lists: Number(lists)}
}
const tallied = (page: Page, t: {open: number; done: number; lists: number}) => expect(head(page)).toContainText(`${t.open} open · ${t.done} done · from ${t.lists} checklist`)

const lineAt = (page: Page, line: string, live = true) => {
  const at = line.lastIndexOf(':')
  return page.getByTestId(live ? 'canvas' : 'body').locator(`[data-bp-id="${line.slice(0, at)}"] > li:nth-child(${Number(line.slice(at + 1)) + 1})`).filter({visible: true})
}

const markColour = (page: Page) =>
  page.evaluate(() => {
    const probe = document.body.appendChild(Object.assign(document.createElement('div'), {style: 'background: var(--c-mark)'}))
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  })

async function atLine(page: Page, line: string, live = true) {
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
  await expect(task(page, 'Share the timeline')).not.toHaveClass(/\bdone\b/)
  await expect(task(page, 'Draft the sitemap')).toHaveClass(/\bdone\b/)
  const work = page.getByTestId('board-column').filter({has: page.locator('.col-h b', {hasText: /^Work$/})})
  const [done, all] = [await work.locator('.tk.done').count(), await work.getByTestId('task').count()]
  const [bar, track] = await Promise.all([work.locator('.prog i'), work.locator('.prog')].map((l) => l.evaluate((e) => e.getBoundingClientRect().width)))
  expect(done).toBeGreaterThan(0)
  expect(bar / track).toBeCloseTo(done / all, 2)
  const workDot = await page.getByTestId('side-notebook').filter({hasText: /^Work/}).locator('.dot').evaluate((e) => getComputedStyle(e).backgroundColor)
  await expect(work.locator('.col-h .dot')).toHaveCSS('background-color', workDot)
  await expect(work.locator('.prog i')).toHaveCSS('background-color', workDot)
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
  await expect(task(page, SUB)).toHaveClass(/\bsub\b/)
  await expect(task(page, TASK)).not.toHaveClass(/\bsub\b/)
  const parentLine = new URL(await task(page, TASK).getAttribute('href') ?? '', 'http://x').searchParams.get('line')
  expect(new URL(await task(page, SUB).getAttribute('href') ?? '', 'http://x').searchParams.get('line')).toBe(parentLine)

  await task(page, TASK).click()
  expect(opened(page)).toBe(id)
  const line = search(page).line
  expect(line).toMatch(/.:0$/)
  made = {id, line}
  await atLine(page, line)
  await page.screenshot({path: test.info().outputPath('j06-at-line-dark-1440.png')})

  await lineAt(page, line).locator('input[type="checkbox"]').first().click()
  await expect(lineAt(page, line)).toHaveAttribute('data-checked', 'true')
  await synced(page)
  await expect.poll(() => checklistOnServer(id), {timeout: 30_000}).toEqual([`x ${TASK}`])
  await page.getByTestId('side-tasks').click()
  await tallied(page, {open: before.open + 1, done: before.done + 1, lists: before.lists + 1})
  await expect(task(page, TASK)).toHaveClass(/\bdone\b/)
  await page.getByTestId('task-card').filter({hasText: TITLE}).getByRole('link', {name: TITLE}).click()
  expect(search(page)).toEqual({n: id})
  await page.goBack()
  await task(page, TASK).click()
  expect(search(page)).toEqual({n: id, line})
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
    await expect(task(page, TASK)).toHaveClass(/\bdone\b/, {timeout: 30_000})
    const before = await tally(page)

    await task(page, TASK).click()
    expect(search(page)).toEqual({n: made.id, line: made.line})
    await expect(page.getByTestId('body')).toContainText('Read only: the editor could not load')
    await expect(page.getByTestId('canvas')).toHaveCount(0)
    await atLine(page, made.line, false)
    await expect(lineAt(page, made.line, false)).toHaveClass(/\bdone\b/)

    await page.getByTestId('delete-note').click()
    await expect.poll(() => opened(page)).toBeUndefined()
    await page.getByTestId('side-tasks').click()
    await tallied(page, {open: before.open - 1, done: before.done - 1, lists: before.lists - 1})
    await expect(task(page, TASK)).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

test('J06 on a phone, offline: the board stacks its columns, a line opens marked, Back says Tasks and returns; a deep link opens at its line, one to no line opens the note', async ({page, context}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({colorScheme: 'dark'})
  await page.setViewportSize({width: 390, height: 844})
  await page.goto(`/?n=${KICKOFF}&line=nowhere:0`)
  await expect(page.getByTestId('canvas')).toBeVisible({timeout: 30_000})
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: kickoff')
  await page.goto(`/?n=${KICKOFF}&line=${KICKOFF_LINE}`)
  await atLine(page, KICKOFF_LINE)
  await synced(page)

  await page.goto('/?view=tasks')
  await expect(page.getByTestId('board-column').first()).toBeVisible({timeout: 30_000})
  const [a, b] = await page.getByTestId('board-column').evaluateAll((cols) => cols.slice(0, 2).map((c) => c.getBoundingClientRect()))
  expect(b.top).toBeGreaterThan(a.bottom - 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({path: test.info().outputPath('j06-board-dark-390.png'), fullPage: true})

  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toBeVisible({timeout: 15_000})
  await task(page, 'Share the timeline').click()
  expect(search(page)).toEqual({n: KICKOFF, line: KICKOFF_LINE})
  await atLine(page, KICKOFF_LINE, false)
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
