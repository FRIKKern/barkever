import {expect, test, type Page} from '@playwright/test'
import {mkdtempSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fakeBin} from '../src/ai/fakes.ts'
import {launchPlain, signIn} from './launch.ts'

const ask = async (page: Page, question: string) => {
  await page.getByLabel('Ask about your notes').fill(question)
  await page.keyboard.press('Enter')
}

test('J07 in the Mac app: the bridge runs fake claude, falls back to fake codex, cites, counts the budget, sends nothing without a match', async ({}, info) => {
  const fake = fakeBin()
  const data = mkdtempSync(join(tmpdir(), 'barkever-mac-e2e-'))
  const run = await launchPlain(data, 'mock', {PATH: `${fake.dir}:${process.env.PATH}`, ANTHROPIC_API_KEY: 'e2e-not-a-key', OPENAI_API_KEY: 'e2e-not-a-key', CLAUDECODE: '1'})
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
  await run.quit()
})
