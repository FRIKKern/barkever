import {expect, test} from '@playwright/test'
import {join} from 'node:path'
import {deleteNotes} from '../../app/e2e/fixtures-cleanup.ts'
import {block, content, copyKickoff, runEdit, selectBlocks, settled, stored, withText} from '../../app/e2e/j08-edit.ts'
import {NO_IDENTITY} from '../src/ai/ask.ts'
import {fakeBin} from '../src/ai/fakes.ts'
import {launchPlain, quitAll, signIn} from './launch.ts'
import {dropProfiles, profile} from './profiles.ts'

const P0 = 'Goals for the Harbor site redesign: faster pages, calmer navigation, one clear call to action.'
const created: string[] = []
test.afterAll(async () => {
  await quitAll()
  dropProfiles()
  await deleteNotes(created)
})

test('J08 in the Mac app: AI Edit runs fake claude on the selection, writes only the accepted change, the undo button restores it, and the switch stops it', async ({}, info) => {
  const fake = fakeBin()
  const data = profile()
  const id = await copyKickoff('mac')
  created.push(id)
  const run = await launchPlain(data, 'mock', {PATH: `${fake.dir}:${process.env.PATH}`, CODEX_HOME: join(fake.home, '.codex'), ANTHROPIC_API_KEY: 'e2e-not-a-key', CLAUDECODE: '1'})
  const {page} = run
  await signIn(page)
  await page.goto(`${new URL(page.url()).origin}/?n=${id}`)
  await expect(page.getByTestId('title')).toHaveValue('AI Edit mac', {timeout: 20_000})
  await selectBlocks(page, block(id, 'p0'), block(id, 'p1'))
  const before = await stored(id)

  await runEdit(page, 'Tighten this')
  await expect(page.getByTestId('ai-edit-meta')).toHaveText('fake-sonnet · your login · ≈ $0.002', {timeout: 30_000})
  const [call] = fake.calls()
  expect(call.cli).toBe('claude')
  expect(call.prompt).toMatch(/^Edit: Tighten this\n\n<selection>\n/)
  expect(call.env.filter((k) => /KEY|TOKEN|CLAUDECODE/.test(k))).toEqual([])
  const changes = page.getByTestId('ai-change')
  await expect(changes).toHaveCount(2)
  await expect(changes.nth(0).locator('ins')).toHaveText(['Tightened.'])
  expect(content(await stored(id))).toBe(content(before))
  await page.screenshot({path: info.outputPath('j08-diff-mac-light.png'), animations: 'disabled'})

  await changes.nth(0).getByTestId('ai-accept').click()
  await changes.nth(1).getByTestId('ai-reject').click()
  const expected = withText(before, block(id, 'p0'), `Tightened. ${P0}`)
  await expect.poll(async () => content(await stored(id)), {timeout: 15_000}).toBe(expected)
  await settled(page)
  expect(content(await stored(id))).toBe(expected)

  await page.getByTestId('ai-undo').click()
  await expect.poll(async () => content(await stored(id)), {timeout: 15_000}).toBe(content(before))
  await expect(page.getByTestId('ai-bar')).toHaveCount(0)

  await page.getByTestId('ask-tab').click()
  await page.getByTestId('ai-switch').uncheck()
  await expect(page.getByTestId('ai-edit')).toHaveCount(0)
  const direct = await page.evaluate((note) => (window as unknown as {barkever: {edit(r: unknown): Promise<unknown>}}).barkever.edit({instruction: 'x', note: {id: note, title: 'x'}, blocks: [{id: 'x', text: 'x'}], notes: []}), id)
  expect(direct).toEqual({error: 'AI is off. Nothing leaves this Mac.'})
  expect(fake.calls()).toHaveLength(1)
  await run.quit()
})

test('J08 in the Mac app: an AI edit that signs itself with an email the note and request never held is refused, with nothing shown or written', async ({}, info) => {
  const sign = 'ada.fjell@example.test'
  const fake = fakeBin({claude: {sign}, codex: {sign}})
  const data = profile()
  const id = await copyKickoff('mac')
  created.push(id)
  const run = await launchPlain(data, 'mock', {PATH: `${fake.dir}:${process.env.PATH}`, CODEX_HOME: join(fake.home, '.codex')})
  const {page} = run
  await signIn(page)
  await page.goto(`${new URL(page.url()).origin}/?n=${id}`)
  await expect(page.getByTestId('title')).toHaveValue('AI Edit mac', {timeout: 20_000})
  await selectBlocks(page, block(id, 'p0'), block(id, 'p1'))
  const before = await stored(id)

  await runEdit(page, 'Tighten this')
  const leak = 'the edit adds an email address that is not in the note or the request'
  await expect(page.getByTestId('ai-error')).toHaveText(`AI Edit failed. claude: ${leak} · codex: ${leak}`, {timeout: 30_000})
  await expect(page.getByTestId('ai-change')).toHaveCount(0)
  expect(fake.calls().map((c) => c.cli)).toEqual(['claude', 'codex'])
  expect(fake.calls().every((c) => c.system.includes(NO_IDENTITY))).toBe(true)
  expect(content(await stored(id))).toBe(content(before))
  await page.screenshot({path: info.outputPath('j08-identity-refused-mac.png'), animations: 'disabled'})
  await run.quit()
})
