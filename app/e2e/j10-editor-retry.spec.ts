import {expect, test, type Page} from '@playwright/test'

test.use({serviceWorkers: 'block'})

const LIGHTHOUSE = 'A small app that reminds field crews of safety checks.'
const CANT_REACH = 'Read only: the editor could not load (can’t reach Barkpark, and it is not on this device yet).'

const row = (page: Page, title: string) => page.getByTestId('note-row').filter({hasText: title})
const canvas = (page: Page) => page.getByTestId('canvas')
type Seen = {armed: () => number; answers: () => number}
const armed = (page: Page) => page.evaluate(() => (window as unknown as Seen).armed())
const firstAnswer = (page: Page) => expect.poll(() => page.evaluate(() => (window as unknown as Seen).answers()), {timeout: 15_000}).toBeGreaterThan(0)

test.beforeEach(({page}) =>
  page.addInitScript(() => {
    const ANSWERED = 'barkpark-answered'
    const waiting = new Map<unknown, boolean>()
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)
    add(ANSWERED, () => waiting.forEach((once, fn) => once && waiting.delete(fn)))
    window.addEventListener = ((type: string, fn: EventListener, o?: AddEventListenerOptions) => {
      if (type === ANSWERED) waiting.set(fn, !!o?.once)
      add(type, fn, o)
    }) as typeof window.addEventListener
    window.removeEventListener = ((type: string, fn: EventListener, o?: EventListenerOptions) => {
      if (type === ANSWERED) waiting.delete(fn)
      remove(type, fn, o)
    }) as typeof window.removeEventListener
    let answers = 0
    new BroadcastChannel('barkever-reach').onmessage = (e: MessageEvent<boolean>) => void (e.data && answers++)
    Object.assign(window, {armed: () => waiting.size, answers: () => answers})
  }),
)

const barkparkAnswers = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) => {
        const from = new BroadcastChannel('barkever-reach')
        const after = new BroadcastChannel('barkever-reach')
        after.onmessage = () => (from.close(), after.close(), done())
        from.postMessage(true)
      }),
  )

function holdEditorFiles(page: Page) {
  let release!: () => void
  const held = new Promise<void>((done) => (release = done))
  let first = true
  const asked = page.waitForRequest('**/editor-files')
  const routed = page.route('**/editor-files', async (route) => {
    if (!first) return route.continue()
    first = false
    await held
    await route.abort()
  })
  return {routed, asked, release}
}

function failEditorFiles(page: Page, times: number) {
  let release!: () => void
  const held = new Promise<void>((done) => (release = done))
  const failed: number[] = []
  const asked = page.waitForRequest('**/editor-files')
  const routed = page.route('**/editor-files', async (route) => {
    if (!failed.length) await held
    if (failed.length >= times) return route.continue()
    failed.push(Date.now())
    await route.abort()
  })
  return {routed, asked, release, failed}
}

async function editableWith(page: Page, words: string) {
  await expect(canvas(page).locator('[contenteditable="true"]')).toBeVisible({timeout: 10_000})
  await expect(canvas(page)).toHaveCount(1)
  await expect(canvas(page)).toContainText(words)
  await expect(page.getByTestId('body')).not.toContainText('Read only')
}

test('a note switch while the editor is still loading leaves one editor, the open note’s', async ({page}) => {
  let release!: () => void
  const held = new Promise<void>((done) => (release = done))
  await page.route('**/editor-files', async (route) => (await held, route.continue()))
  const asked = page.waitForRequest('**/editor-files')
  await page.goto('/?n=fx-note-02')
  await asked
  await row(page, 'Lighthouse app: brief').click()
  await expect(page.getByTestId('title')).toHaveValue('Lighthouse app: brief')
  release()
  await editableWith(page, LIGHTHOUSE)
})

test('notes switched while Barkpark can’t be reached leave one retry, and the open note loads on Barkpark’s next answer', async ({page}) => {
  await page.route('**/editor-files', (route) => route.abort())
  await page.goto('/?n=fx-note-01')
  await expect(page.getByTestId('body')).toContainText(CANT_REACH)
  await firstAnswer(page)
  for (const title of ['Harbor redesign: wireframes', 'Harbor redesign: content plan', 'Lighthouse app: brief']) {
    await row(page, title).click()
    await expect(page.getByTestId('title')).toHaveValue(title)
  }
  await expect.poll(() => armed(page)).toBe(1)

  const retried = page.waitForRequest('**/editor-files')
  await barkparkAnswers(page)
  await retried
  await expect.poll(() => armed(page)).toBe(1)
  await expect(page.getByTestId('body')).toContainText(CANT_REACH)

  await page.unroute('**/editor-files')
  await barkparkAnswers(page)
  await editableWith(page, LIGHTHOUSE)
  expect(await armed(page)).toBe(0)
  await barkparkAnswers(page)
  await expect(canvas(page)).toHaveCount(1)
})

test('a load that fails after a note switch arms one retry, for the open note', async ({page}) => {
  const {routed, asked, release} = holdEditorFiles(page)
  await routed
  await page.goto('/?n=fx-note-02')
  await asked
  await firstAnswer(page)
  await row(page, 'Lighthouse app: brief').click()
  await expect(page.getByTestId('title')).toHaveValue('Lighthouse app: brief')
  release()
  await expect(page.getByTestId('body')).toContainText(CANT_REACH)
  expect(await armed(page)).toBe(1)
  await barkparkAnswers(page)
  await editableWith(page, LIGHTHOUSE)
})

test('Barkpark answers while the editor is still loading: when that load fails, it loads again at once', async ({page}) => {
  const {routed, asked, release, failed} = failEditorFiles(page, 1)
  await routed
  await page.goto('/?n=fx-note-04')
  await asked
  await barkparkAnswers(page)
  const again = page.waitForRequest('**/editor-files')
  release()
  await again
  expect(Date.now() - failed[0]).toBeLessThan(1500)
  await editableWith(page, LIGHTHOUSE)
})

async function loadFailsAfterTheAnswer(page: Page, times: number) {
  const files = failEditorFiles(page, times)
  await files.routed
  await page.goto('/?n=fx-note-02')
  await files.asked
  await firstAnswer(page)
  await row(page, 'Lighthouse app: brief').click()
  await expect(page.getByTestId('title')).toHaveValue('Lighthouse app: brief')
  const answers = await page.evaluate(() => (window as unknown as Seen).answers())
  files.release()
  await expect(page.getByTestId('body')).toContainText(CANT_REACH)
  return {failed: files.failed, answers}
}

test('one failed editor load while Barkpark keeps answering: the note turns editable with no new answer', async ({page}) => {
  const {failed, answers} = await loadFailsAfterTheAnswer(page, 1)
  await editableWith(page, LIGHTHOUSE)
  expect(failed).toHaveLength(1)
  expect(await page.evaluate(() => (window as unknown as Seen).answers())).toBe(answers)
})

test('a note switch stops the old note’s retry timer', async ({page}) => {
  const {failed} = await loadFailsAfterTheAnswer(page, 99)
  await row(page, 'Harbor redesign: wireframes').click()
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: wireframes')
  await expect.poll(() => failed.length).toBe(2)
  await page.waitForTimeout(3000)
  expect(failed.filter((at) => at > failed[1])).toHaveLength(1)
})

test('the stream reconnects but Barkpark never says welcome: the note still turns editable', async ({page, context}) => {
  let reconnected = false
  await page.route('**/editor-files', (route) => (reconnected ? route.continue() : route.abort()))
  await page.goto('/?n=fx-note-04')
  await expect(page.getByTestId('body')).toContainText(CANT_REACH)
  await firstAnswer(page)
  const answers = await page.evaluate(() => (window as unknown as Seen).answers())
  await page.route('**/api/listen**', (route) => route.fulfill({status: 200, contentType: 'text/event-stream', body: ': no welcome\n\n'}))
  const reconnect = page.waitForRequest('**/api/listen**')
  await context.setOffline(true)
  await context.setOffline(false)
  await reconnect
  reconnected = true
  await expect(canvas(page).locator('[contenteditable="true"]')).toBeVisible({timeout: 30_000})
  expect(await page.evaluate(() => (window as unknown as Seen).answers())).toBe(answers)
})

test('while the editor can’t load it asks again after 2 s; an answer asks at once and the next try waits 8 s', async ({page}) => {
  const {failed} = await loadFailsAfterTheAnswer(page, 99)
  await expect.poll(() => failed.length, {timeout: 10_000}).toBe(2)
  expect(failed[1] - failed[0]).toBeGreaterThanOrEqual(1900)
  expect(failed[1] - failed[0]).toBeLessThan(3900)
  await expect.poll(() => armed(page)).toBe(1)
  const answered = Date.now()
  await barkparkAnswers(page)
  await expect.poll(() => failed.length, {timeout: 3000}).toBe(3)
  expect(failed[2] - answered).toBeLessThan(1500)
  await page.waitForTimeout(5000)
  expect(failed).toHaveLength(3)
})

test('an editor too old for Barkever arms no retry', async ({page}) => {
  await page.addInitScript(() => {
    const define = customElements.define.bind(customElements)
    customElements.define = (name, ctor, options) => {
      if (name === 'bp-paper-editor') Object.defineProperty(ctor, 'CONTRACT_VERSION', {value: '1.16.0'})
      define(name, ctor, options)
    }
  })
  await page.goto('/?n=fx-note-04')
  await expect(page.getByText('Barkpark serves editor 1.16.0; Barkever needs 1.17.0 or newer')).toBeVisible({timeout: 30_000})
  expect(await armed(page)).toBe(0)
})
