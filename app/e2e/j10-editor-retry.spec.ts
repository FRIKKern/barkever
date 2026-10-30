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
  const {routed, asked, release} = holdEditorFiles(page)
  await routed
  await page.goto('/?n=fx-note-04')
  await asked
  await barkparkAnswers(page)
  release()
  await editableWith(page, LIGHTHOUSE)
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
