import {expect, test, type Page} from '@playwright/test'
import {clickCaret} from './caret'
import {device, synced} from './devices'
import {deleteNotes} from './fixtures-cleanup'
import {aiEdit, block, content, copyKickoff, runEdit, selectBlocks, settled, stored, withText, type Stored} from './j08-edit'

type Sent = {instruction: string; note: {id: string; title: string}; blocks: {id: string; text: string}[]; notes: {id: string; title: string; text: string}[]}

const P0 = 'Goals for the Harbor redesign: faster pages, calmer navigation, one call to action.'
const P1 = 'Owner: Ola Testesen. Due end of quarter.'
const created: string[] = []
test.afterAll(() => deleteNotes(created))

const edits = (page: Page) => page.evaluate(() => (window as unknown as {edits: Sent[]}).edits)

function stubBridge(page: Page) {
  return page.addInitScript(
    ([p0, p1]) => {
      const w = window as unknown as {edits: Sent[]; barkever: unknown}
      w.edits = []
      w.barkever = {
        setAi: async () => {},
        ask: async () => ({error: 'not in this test'}),
        edit: async (req: Sent) => {
          w.edits.push(req)
          if (req.instruction === 'throw') throw new Error('the Mac app went away')
          if (req.instruction === 'error') return {error: 'claude: fake claude: not signed in · codex: fake codex: not signed in'}
          const [a, b] = req.blocks.map((x) => x.id)
          return {
            changes: [
              {block: a, after: p0},
              {block: b, after: p1},
            ],
            citations: [{id: req.note.id, quote: 'one clear call to action'}],
            provider: 'claude',
            model: 'fake-sonnet',
            tokens: 1234,
            costUsd: 0.002,
            read: req.notes.length,
          }
        },
      }
    },
    [P0, P1],
  )
}

async function openCopy(page: Page, tag: string) {
  const id = await copyKickoff(tag)
  created.push(id)
  await stubBridge(page)
  await page.goto(`/?n=${id}`)
  await expect(page.getByTestId('title')).toHaveValue(`AI Edit ${tag}`, {timeout: 20_000})
  await selectBlocks(page, block(id, 'p0'), block(id, 'p1'))
  return id
}

test('J08 AI Edit needs the Mac bridge and a selection', async ({page}) => {
  await page.goto('/?n=fx-note-00')
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: kickoff', {timeout: 20_000})
  await expect(page.getByTestId('ai-edit')).toHaveCount(0)
})

test('J08 AI Edit shows a diff, writes nothing before accept, stores exactly the accepted change, and one undo restores the note', async ({page}) => {
  await page.emulateMedia({colorScheme: 'dark'})
  const id = await openCopy(page, 'accept')
  const before = await stored(id)

  await runEdit(page, 'Tighten this')
  const sent = (await edits(page))[0]
  expect(sent.instruction).toBe('Tighten this')
  expect(sent.note.id).toBe(id)
  expect(sent.blocks).toEqual([
    {id: block(id, 'p0'), text: 'Goals for the Harbor site redesign: faster pages, calmer navigation, one clear call to action.'},
    {id: block(id, 'p1'), text: 'Owner: Ola Testesen. Deadline end of quarter.'},
  ])
  expect(sent.notes.map((n) => n.id)).toContain(id)

  await expect(page.getByTestId('ai-edit-meta')).toHaveText('fake-sonnet · your login · ≈ $0.002')
  await expect(page.getByTestId('ai-source')).toHaveText(['AI Edit accept'])
  const changes = page.getByTestId('ai-change')
  await expect(changes).toHaveCount(2)
  await expect(changes.nth(0).locator('del')).toHaveText(['site', 'clear'])
  await expect(changes.nth(1).locator('ins')).toHaveText(['Due'])
  expect(await changes.nth(0).locator('p').textContent()).toBe('Goals for the Harbor site redesign: faster pages, calmer navigation, one clear call to action.')
  await expect(page.getByTestId('ai-bar')).toContainText('2 changes2 to review')
  expect(content(await stored(id))).toBe(content(before))

  await changes.nth(0).getByTestId('ai-accept').click()
  await changes.nth(1).getByTestId('ai-reject').click()
  await expect(changes.nth(0)).toContainText('Accepted')
  await expect(changes.nth(1)).toContainText('Rejected')
  expect(await changes.nth(0).locator('p').textContent()).toBe(P0)
  expect(await changes.nth(1).locator('p').textContent()).toBe('Owner: Ola Testesen. Deadline end of quarter.')
  await expect(page.getByTestId('ai-bar')).toContainText('2 changesall reviewed')
  const expected = withText(before, block(id, 'p0'), P0)
  await expect.poll(async () => content(await stored(id)), {timeout: 15_000}).toBe(expected)
  await settled(page)
  expect(content(await stored(id))).toBe(expected)
  await expect(page.getByTestId('canvas')).toContainText(P0)
  await expect(page.getByTestId('canvas')).toContainText('Owner: Ola Testesen. Deadline end of quarter.')

  await expect(page.getByTestId('ai-undo')).toBeVisible()
  await page.keyboard.press('z')
  await page.keyboard.press('ControlOrMeta')
  await page.keyboard.press('Shift+ControlOrMeta+z')
  for (const field of ['title', 'tag-add']) {
    await page.getByTestId(field).focus()
    await page.keyboard.press('ControlOrMeta+z')
    await page.evaluate(() => (document.activeElement as HTMLElement).blur())
  }
  await page.waitForTimeout(500)
  expect(content(await stored(id))).toBe(expected)
  await expect(page.getByTestId('ai-undo')).toBeVisible()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(async () => content(await stored(id)), {timeout: 15_000}).toBe(content(before))
  await expect(page.getByTestId('canvas')).toContainText('one clear call to action')
  await expect(page.getByTestId('ai-bar')).toHaveCount(0)
  await settled(page)
  expect(content(await stored(id))).toBe(content(before))
})

test('J08 AI Edit rejected in full leaves the stored note byte-identical', async ({page}) => {
  const id = await openCopy(page, 'reject')
  const before = await stored(id)
  await aiEdit(page).click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Tighten this')
  await page.keyboard.press('Enter')
  expect((await edits(page)).map((e) => e.instruction)).toEqual(['Tighten this'])
  await expect(page.getByTestId('ai-change')).toHaveCount(2)
  await page.getByTestId('ai-reject-all').click()
  await expect(page.getByTestId('ai-change').filter({hasText: 'Rejected'})).toHaveCount(2)
  await expect(page.getByTestId('ai-undo')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await page.getByTestId('ai-done').click()
  await expect(page.getByTestId('ai-bar')).toHaveCount(0)
  await settled(page)
  expect(JSON.stringify(await stored(id))).toBe(JSON.stringify(before))
  await expect(page.getByTestId('canvas')).toContainText('one clear call to action')
})

test('J08 Accept all after one reject stores only the rest', async ({page}) => {
  const id = await openCopy(page, 'all')
  const before = await stored(id)
  await runEdit(page, 'Tighten this')
  await page.getByTestId('ai-change').nth(0).getByTestId('ai-reject').click()
  await page.getByTestId('ai-accept-all').click()
  await expect(page.getByTestId('ai-change').nth(1)).toContainText('Accepted')
  const expected = withText(before, block(id, 'p1'), P1)
  await expect.poll(async () => content(await stored(id)), {timeout: 15_000}).toBe(expected)
  await settled(page)
  expect(content(await stored(id))).toBe(expected)
})

test('J08 AI Edit that fails says why and writes nothing', async ({page}) => {
  const id = await openCopy(page, 'fail')
  const before = await stored(id)
  await runEdit(page, 'throw')
  await expect(page.getByTestId('ai-error')).toHaveText('AI Edit failed. the Mac app went away')
  await expect(page.getByTestId('ai-change')).toHaveCount(0)
  await page.getByTestId('ai-done').click()
  await selectBlocks(page, block(id, 'p0'), block(id, 'p1'))
  await runEdit(page, 'error')
  await expect(page.getByTestId('ai-error')).toHaveText('AI Edit failed. claude: fake claude: not signed in · codex: fake codex: not signed in')
  await page.getByTestId('ai-done').click()
  await settled(page)
  expect(JSON.stringify(await stored(id))).toBe(JSON.stringify(before))
})

test('J08 AI Edit is gone while the AI switch is off', async ({page}) => {
  const id = await openCopy(page, 'off')
  await expect(aiEdit(page)).toBeEnabled()
  await page.getByTestId('title').click()
  await expect(aiEdit(page)).toBeDisabled()
  await selectBlocks(page, block(id, 'p0'), block(id, 'p0'))
  await expect(aiEdit(page)).toBeEnabled()
  await page.getByTestId('ask-tab').click()
  await page.getByTestId('ai-switch').uncheck()
  await expect(page.getByTestId('ai-edit')).toHaveCount(0)
  expect(await edits(page)).toEqual([])
})

const textOf = (d: Stored, id: string) => d.body.blocks.find((b) => b.id === id)!.content!.map((c) => c.value).join('')

async function remoteTypes(b: Page, id: string, which: 'p0' | 'p1', text: string) {
  await b.goto(`/?n=${id}`)
  const el = b.getByTestId('canvas').locator(`[data-bp-id="${block(id, which)}"]`)
  await expect(el).toBeVisible({timeout: 20_000})
  const box = (await el.boundingBox())!
  await clickCaret(el, {x: box.width - 2, y: box.height / 2})
  await b.keyboard.press('End')
  await b.keyboard.type(text)
  await b.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await synced(b)
}

const reaches = (page: Page, text: string) => expect.poll(() => page.getByTestId('canvas').evaluate((el) => el.textContent), {timeout: 30_000}).toContain(text)

test('J08 another device typing into a block under review keeps its words: accepting the AI change parks theirs in a conflict copy', async ({page, browser, baseURL}) => {
  test.setTimeout(120_000)
  const id = await openCopy(page, 'remote-accept')
  await runEdit(page, 'Tighten this')
  await expect(page.getByTestId('ai-change')).toHaveCount(2)
  const other = await device(browser, baseURL!)
  await remoteTypes(other, id, 'p0', ' REMOTE-P0.')
  await reaches(page, 'REMOTE-P0')
  await page.getByTestId('ai-change').nth(0).getByTestId('ai-accept').click()
  await settled(page)
  await synced(page)
  const doc = await stored(id)
  expect(textOf(doc, block(id, 'p0'))).toBe(P0)
  expect(JSON.stringify((doc as unknown as {conflicts?: unknown[]}).conflicts ?? [])).toContain('REMOTE-P0')
  await other.context().close()
})

test('J08 one undo takes back only the AI change: words another device typed meanwhile stay', async ({page, browser, baseURL}) => {
  test.setTimeout(120_000)
  const id = await openCopy(page, 'remote-undo')
  await runEdit(page, 'Tighten this')
  await page.getByTestId('ai-change').nth(0).getByTestId('ai-accept').click()
  await settled(page)
  const other = await device(browser, baseURL!)
  await remoteTypes(other, id, 'p1', ' REMOTE-P1.')
  await reaches(page, 'REMOTE-P1')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('ai-bar')).toHaveCount(0)
  await settled(page)
  await synced(page)
  const doc = await stored(id)
  expect(textOf(doc, block(id, 'p0'))).toBe('Goals for the Harbor site redesign: faster pages, calmer navigation, one clear call to action.')
  expect(textOf(doc, block(id, 'p1'))).toBe('Owner: Ola Testesen. Deadline end of quarter. REMOTE-P1.')
  await expect(page.getByTestId('canvas')).toContainText('REMOTE-P1')
  await other.context().close()
})

for (const [width, height, label] of [[1440, 900, '✨ AI Edit'], [390, 844, '✨']] as const)
  for (const scheme of ['light', 'dark'] as const)
    test(`J08 AI Edit diff at ${width} in ${scheme} fits and keeps its buttons whole`, async ({page}) => {
      await page.setViewportSize({width, height})
      await page.emulateMedia({colorScheme: scheme})
      await openCopy(page, `shot-${width}-${scheme}`)
      await expect(aiEdit(page)).toHaveText(label)
      await runEdit(page, 'Tighten this')
      await expect(page.getByTestId('ai-change')).toHaveCount(2)
      for (const el of [page.getByTestId('ai-bar'), page.getByTestId('ai-change').first(), page.getByTestId('ai-reject-all')]) {
        const box = (await el.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({path: test.info().outputPath(`j08-diff-${scheme}-${width}.png`), animations: 'disabled'})
    })
