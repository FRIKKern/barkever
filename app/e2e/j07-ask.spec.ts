import {expect, test, type Page} from '@playwright/test'

type Sent = {question: string; notes: {id: string; title: string; text: string}[]}
type Mode = 'claude' | 'codex' | 'error' | 'missing' | 'reject' | 'slow'

const ask = async (page: Page, question: string) => {
  await page.getByLabel('Ask about your notes').fill(question)
  await page.keyboard.press('Enter')
}
const asks = (page: Page) => page.evaluate(() => (window as unknown as {asks: Sent[]}).asks)
const asked = (page: Page) => page.evaluate(() => Number(localStorage.getItem('stub.asked') ?? 0))
const told = (page: Page) => page.evaluate(() => localStorage.getItem('stub.ai'))
const lum = (c: string) => {
  const [r, g, b] = c.match(/\d+/g)!.slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const knob = (page: Page) => page.getByTestId('ai-switch').evaluate(async (el) => {
  await Promise.all(el.getAnimations({subtree: true}).map((a) => a.finished))
  return {knob: getComputedStyle(el, '::after').backgroundColor, track: getComputedStyle(el).backgroundColor}
})
const switchReadable = async (page: Page) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({colorScheme})
    const k = await knob(page)
    expect(k.knob).toBe('rgb(255, 255, 255)')
    expect(contrast(k.knob, k.track)).toBeGreaterThanOrEqual(3)
  }
}
const mode = (page: Page, m: Mode) => page.evaluate((m) => ((window as unknown as {mode: Mode}).mode = m), m)

function stubBridge(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as {asks: Sent[]; mode: Mode; barkever: unknown; release: () => void}
    w.asks = []
    w.mode = 'claude'
    w.barkever = {
      setAi: async (on: boolean) => localStorage.setItem('stub.ai', String(on)),
      ask: async (req: Sent) => {
        w.asks.push(req)
        localStorage.setItem('stub.asked', String(Number(localStorage.getItem('stub.asked') ?? 0) + 1))
        if (w.mode === 'reject') throw new Error('the Mac app went away')
        if (w.mode === 'slow') await new Promise<void>((done) => (w.release = done))
        if (w.mode === 'error') return {error: 'claude: fake claude: not signed in · codex: fake codex: not signed in'}
        if (w.mode === 'missing') return {found: false, answer: 'No date is written down.', citations: [], provider: 'claude', model: 'fake-sonnet', tokens: 900, costUsd: 0.001, read: req.notes.length}
        const hits = req.notes.flatMap((n) => n.text.split(/(?<=\.)\s+|\n+/).filter((s) => /carousel/i.test(s)).slice(0, 1).map((quote) => ({id: n.id, title: n.title, quote})))
        const codex = w.mode === 'codex'
        return {
          found: true,
          answer: hits.map((h, i) => `${h.title} [${i + 1}]`).join(', ') + '.',
          citations: hits.map(({id, quote}) => ({id, quote})),
          provider: w.mode,
          model: codex ? 'codex' : 'fake-sonnet',
          tokens: 1234,
          costUsd: codex ? null : 0.002,
          read: req.notes.length,
        }
      },
    }
  })
}

test('J07 Ask in the web app without the Mac bridge says where Ask runs', async ({page}) => {
  await page.goto('/?n=fx-note-10')
  await page.getByTestId('ask-tab').click()
  await expect(page.getByTestId('ai-off')).toHaveText('Ask runs in the Barkever Mac app.')
  await expect(page.getByLabel('Ask about your notes')).toHaveCount(0)
  await expect(page.getByTestId('linked-from').first()).toBeHidden()
})

test('J07 Ask answers from the notes it read, cites each one, says when nothing matches, and has an off switch', async ({page}) => {
  await stubBridge(page)
  await page.emulateMedia({colorScheme: 'dark'})
  await page.goto('/?n=fx-note-10')
  await page.getByTestId('ask-tab').click()

  await ask(page, 'What did we decide about the carousel?')
  const answer = page.getByTestId('ask-answer').last()
  await expect(answer).toContainText(/^(Harbor redesign: wireframes|Weekly sync, week 41) 1, (Harbor redesign: wireframes|Weekly sync, week 41) 2\./)
  const sources = await page.getByTestId('ask-source').evaluateAll((els) => els.map((e) => e.textContent!.slice(1)).sort())
  expect(sources).toEqual(['Harbor redesign: wireframes“Round two dropped the carousel.”', 'Weekly sync, week 41“Decision: drop the carousel.”'])
  await expect(page.getByTestId('ask-meta')).toHaveText('Read 3 notes · fake-sonnet · your login · ≈ $0.002')
  const [sent] = await asks(page)
  expect(sent.question).toBe('What did we decide about the carousel?')
  expect(sent.notes.map((n) => n.id).sort()).toEqual(['fx-note-02', 'fx-note-10', 'fx-note-38'])
  expect(Object.keys(sent.notes[0])).toEqual(['id', 'title', 'text'])

  await ask(page, 'When is the zebra xylophone recital?')
  await expect(page.getByTestId('ask-answer').last()).toHaveText(/^Not in your notes\.No note mentions this\. Checked \d+ notes; nothing was sent\.$/)
  expect(await asks(page)).toHaveLength(1)
  await page.screenshot({path: test.info().outputPath('j07-ask-dark.png'), animations: 'disabled'})

  const cited = page.getByTestId('ask-answer').first()
  const titles = await cited.getByTestId('ask-source').evaluateAll((els) => els.map((e) => e.querySelector('.t')!.textContent!.replace(/^\d+/, '')))
  expect(new Set(titles).size).toBe(2)
  await expect(cited.getByTestId('ask-cite')).toHaveCount(titles.length)
  for (const [i, title] of titles.entries()) {
    await cited.getByTestId('ask-cite').nth(i).click()
    await expect(page.getByTestId('title')).toHaveValue(title)
  }
  await page.getByTestId('ask-source').filter({hasText: 'Harbor redesign: wireframes'}).click()
  await expect(page).toHaveURL(/n=fx-note-02/)
  await expect(page.getByTestId('ask-answer')).toHaveCount(2)

  await mode(page, 'codex')
  await ask(page, 'carousel')
  await expect(page.getByTestId('ask-meta').last()).toHaveText('Read 2 notes · codex · your login · 1,234 tokens')

  await mode(page, 'slow')
  await ask(page, 'carousel')
  await expect(page.locator('.a.meta').last()).toHaveText('Reading 2 notes…')
  await page.evaluate(() => (window as unknown as {release: () => void}).release())
  await expect(page.getByTestId('ask-meta').last()).toHaveText('Read 2 notes · fake-sonnet · your login · ≈ $0.002')

  await mode(page, 'reject')
  await ask(page, 'carousel')
  await expect(page.getByTestId('ask-error').last()).toContainText('the Mac app went away')

  await mode(page, 'missing')
  await ask(page, 'carousel')
  await expect(page.getByTestId('ask-answer').last()).toHaveText('Not in your notes.No date is written down.Checked 2 notes · fake-sonnet · your login · ≈ $0.001')

  const turns = await page.locator('.q').count()
  await page.getByLabel('Ask about your notes').fill('   ')
  await page.keyboard.press('Enter')
  await expect(page.locator('.q')).toHaveCount(turns)

  await mode(page, 'error')
  await ask(page, 'carousel')
  await expect(page.getByTestId('ask-error').last()).toHaveText('Ask failed.claude: fake claude: not signed in · codex: fake codex: not signed in')

  const before = await asked(page)
  expect(before).toBe(6)
  await page.getByTestId('ai-switch').uncheck()
  await expect(page.getByTestId('ai-off')).toHaveText('AI is off. Nothing leaves this Mac.')
  await expect(page.getByLabel('Ask about your notes')).toHaveCount(0)
  expect(await told(page)).toBe('false')
  await switchReadable(page)
  await page.keyboard.press('Enter')
  await page.evaluate(() => localStorage.removeItem('stub.ai'))
  await page.reload()
  await page.getByTestId('ask-tab').click()
  await expect(page.getByTestId('ai-off')).toHaveText('AI is off. Nothing leaves this Mac.')
  await expect(page.getByLabel('Ask about your notes')).toHaveCount(0)
  await expect.poll(() => told(page)).toBe('false')
  expect(await asked(page)).toBe(before)
  await page.getByTestId('ai-switch').check()
  expect(await told(page)).toBe('true')
  await switchReadable(page)
  await ask(page, 'carousel')
  await expect(page.getByTestId('ask-meta').last()).toHaveText('Read 2 notes · fake-sonnet · your login · ≈ $0.002')
  expect(await asked(page)).toBe(before + 1)
})
