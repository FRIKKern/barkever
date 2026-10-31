import {expect, test, type Page} from '@playwright/test'
import {deleteNotes} from './fixtures-cleanup'
import {aiEdit, block, content, copyKickoff, runEdit, selectBlocks, settled, stored, withText} from './j08-edit'

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
  await page.screenshot({path: test.info().outputPath(`j08-diff-dark-${page.viewportSize()!.width}.png`), animations: 'disabled'})
  expect(content(await stored(id))).toBe(content(before))

  await changes.nth(0).getByTestId('ai-accept').click()
  await changes.nth(1).getByTestId('ai-reject').click()
  await expect(changes.nth(0)).toContainText('Accepted')
  await expect(changes.nth(1)).toContainText('Rejected')
  const expected = withText(before, block(id, 'p0'), P0)
  await expect.poll(async () => content(await stored(id)), {timeout: 15_000}).toBe(expected)
  await settled(page)
  expect(content(await stored(id))).toBe(expected)
  await expect(page.getByTestId('canvas')).toContainText(P0)
  await expect(page.getByTestId('canvas')).toContainText('Owner: Ola Testesen. Deadline end of quarter.')

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
  await runEdit(page, 'Tighten this')
  await expect(page.getByTestId('ai-change')).toHaveCount(2)
  await page.getByTestId('ai-reject-all').click()
  await expect(page.getByTestId('ai-change').filter({hasText: 'Rejected'})).toHaveCount(2)
  await page.getByTestId('ai-done').click()
  await expect(page.getByTestId('ai-bar')).toHaveCount(0)
  await settled(page)
  expect(JSON.stringify(await stored(id))).toBe(JSON.stringify(before))
  await expect(page.getByTestId('canvas')).toContainText('one clear call to action')
})

test('J08 AI Edit is gone while the AI switch is off', async ({page}) => {
  await openCopy(page, 'off')
  await expect(aiEdit(page)).toBeEnabled()
  await page.getByTestId('ask-tab').click()
  await page.getByTestId('ai-switch').uncheck()
  await expect(page.getByTestId('ai-edit')).toHaveCount(0)
  expect(await edits(page)).toEqual([])
})
