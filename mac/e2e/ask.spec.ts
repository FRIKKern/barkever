import {expect, test, type Page} from '@playwright/test'
import {readFileSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {fakeBin} from '../src/ai/fakes.ts'
import {launchPlain, quitAll, signIn} from './launch.ts'
import {dropProfiles, profile} from './profiles.ts'

test.afterAll(async () => {
  await quitAll()
  dropProfiles()
})

const ask = async (page: Page, question: string) => {
  await page.getByLabel('Ask about your notes').fill(question)
  await page.keyboard.press('Enter')
}

test('J07 in the Mac app: the bridge runs fake claude, falls back to fake codex, cites, counts the budget, sends nothing without a match', async ({}, info) => {
  const fake = fakeBin()
  const data = profile()
  const run = await launchPlain(data, 'mock', {PATH: `${fake.dir}:${process.env.PATH}`, CODEX_HOME: join(fake.home, '.codex'), ANTHROPIC_API_KEY: 'e2e-not-a-key', OPENAI_API_KEY: 'e2e-not-a-key', CLAUDECODE: '1'})
  const {page} = run
  await signIn(page)
  await page.emulateMedia({colorScheme: 'dark'})
  await page.goto(`${new URL(page.url()).origin}/?n=fx-note-10`)
  await page.getByTestId('ask-tab').click()

  await ask(page, 'What did we decide about the carousel?')
  await expect(page.getByTestId('ask-meta')).toHaveText('Read 3 notes · fake-sonnet · your login · ≈ $0.002', {timeout: 30_000})
  await expect(page.getByTestId('ask-source')).toHaveCount(3)
  const [first] = fake.calls()
  expect(first.cli).toBe('claude')
  expect(first.prompt).toMatch(/^Question: What did we decide about the carousel\?\n\n<notes>\n/)
  expect(first.env.filter((k) => /KEY|TOKEN|CLAUDECODE/.test(k))).toEqual([])
  const cited = page.getByTestId('ask-answer').first()
  const titles = await cited.getByTestId('ask-source').evaluateAll((els) => els.map((e) => e.querySelector('.t')!.textContent!.replace(/^\d+/, '')))
  expect(new Set(titles).size).toBe(3)
  await expect(cited.getByTestId('ask-cite')).toHaveCount(titles.length)
  for (const [i, title] of titles.entries()) {
    await cited.getByTestId('ask-cite').nth(i).click()
    await expect(page.getByTestId('title')).toHaveValue(title)
  }

  await ask(page, 'When is the zebra xylophone recital?')
  await expect(page.getByTestId('ask-answer').last()).toContainText('nothing was sent')
  expect(fake.calls()).toHaveLength(1)

  fake.behave({claude: 'fail'})
  await ask(page, 'carousel')
  await expect(page.getByTestId('ask-meta').last()).toHaveText('Read 2 notes · codex · your login · 750 tokens', {timeout: 30_000})
  expect(fake.calls().map((c) => c.cli)).toEqual(['claude', 'claude', 'codex'])
  await expect(page.getByTestId('ask-meta').last()).toBeInViewport()
  await page.screenshot({path: info.outputPath('j07-ask-mac-dark.png'), animations: 'disabled'})

  await page.getByTestId('ask-answer').last().getByTestId('ask-cite').first().click()
  await expect(page.getByTestId('title')).toHaveValue(/Harbor redesign: wireframes|Weekly sync, week 41/)
  expect(JSON.parse(readFileSync(join(data, 'ai-budget.json'), 'utf8')).tokens).toBe(1750)

  fake.behave({})
  const direct = () => page.evaluate(() => (window as unknown as {barkever: {ask(r: unknown): Promise<unknown>}}).barkever.ask({question: 'carousel', notes: [{id: 'fx-note-02', title: 'Harbor redesign: wireframes', text: 'Round two dropped the carousel.'}]}))
  const calls = fake.calls().length
  await page.getByTestId('ai-switch').uncheck()
  await expect(page.getByTestId('ai-off')).toHaveText('AI is off. Nothing leaves this Mac.')
  await expect(page.getByLabel('Ask about your notes')).toHaveCount(0)
  expect(await direct()).toEqual({error: 'AI is off. Nothing leaves this Mac.'})
  rmSync(join(data, 'ai-switch.json'))
  await page.reload()
  await page.getByTestId('ask-tab').click()
  await expect(page.getByTestId('ai-off')).toHaveText('AI is off. Nothing leaves this Mac.')
  expect(await direct()).toEqual({error: 'AI is off. Nothing leaves this Mac.'})
  expect(fake.calls()).toHaveLength(calls)
  await page.getByTestId('ai-switch').check()
  await expect(page.getByLabel('Ask about your notes')).toBeVisible()
  expect(await direct()).toMatchObject({found: true, provider: 'claude'})
  expect(fake.calls()).toHaveLength(calls + 1)
  await run.quit()
})
