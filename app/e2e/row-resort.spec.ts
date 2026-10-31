import {expect, test, type BrowserContext, type Page} from '@playwright/test'
import {serverNote} from './devices'

const rows = '[data-testid=note-row]'
const row = (page: Page, id: string) => page.locator(`${rows}[data-note-id="${id}"]`)

type Press = {offline: boolean; resort?: boolean; button?: 'left' | 'middle'; interrupt?: (here: Page, target: string) => Promise<unknown>}

async function pressResort(context: BrowserContext, {offline, resort = true, button = 'left', interrupt}: Press, then: (here: Page, ids: {target: string; mover: string}, box: {y: number}) => Promise<void>) {
  const [here, there] = [await context.newPage(), await context.newPage()]
  for (const p of [here, there]) {
    await p.goto('/')
    await expect(p.locator(rows)).toHaveCount(50, {timeout: 20_000})
  }
  await (await context.newCDPSession(here)).send('Emulation.setCPUThrottlingRate', {rate: 4})
  await context.setOffline(offline)
  const all = await here.locator(rows).evaluateAll((r) => r.map((x) => (x as HTMLElement).dataset.noteId!))
  const [target, mover] = [all[2], all[10]]
  const box = (await row(here, target).boundingBox())!
  await here.getByTestId('search').focus()
  await here.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await here.mouse.down({button})
  await interrupt?.(here, target)
  await row(there, mover).click()
  const title = there.getByTestId('title')
  const was = await title.inputValue()
  try {
    if (resort) {
      const moved = `moved by the other tab ${Date.now()}`
      await title.fill(moved)
      await expect(row(here, mover).getByTestId('note-title')).toHaveText(moved)
    }
    await then(here, {target, mover}, box)
  } finally {
    if (resort) {
      await title.fill(was)
      if (!offline) await expect.poll(async () => (await serverNote(mover))?.title, {timeout: 15_000}).toBe(was)
    }
  }
}

const opensAfterResort = async (here: Page, {target, mover}: {target: string; mover: string}, box: {y: number}) => {
  expect((await row(here, target).boundingBox())!.y).toBe(box.y)
  await here.mouse.up()
  await expect(here).toHaveURL((u) => u.searchParams.get('n') === target, {timeout: 3_000})
  await expect(here.locator(rows).first()).toHaveAttribute('data-note-id', mover)
}

const resortsWhilePressed = async (here: Page, {mover}: {mover: string}) => {
  await expect(here.locator(rows).first()).toHaveAttribute('data-note-id', mover)
  await here.mouse.move(0, 0)
  await here.mouse.up()
}

for (const offline of [true, false]) {
  const how = offline ? 'offline' : 'online'
  test(`control: press and release on a row opens it while another tab is busy (${how}, 4x CPU)`, ({context}) =>
    pressResort(context, {offline, resort: false}, async (here, {target}) => {
      await here.mouse.up()
      await expect(here).toHaveURL((u) => u.searchParams.get('n') === target, {timeout: 3_000})
    }))
  test(`a row click survives the list re-sorting between press and release (a save from another tab, ${how}, 4x CPU)`, ({context}) => pressResort(context, {offline}, opensAfterResort))
}

test('a context menu during the press ends the hold, so the list re-sorts with no release (4x CPU)', ({context}) =>
  pressResort(context, {offline: true, interrupt: (here, target) => row(here, target).dispatchEvent('contextmenu')}, resortsWhilePressed))

test('the window losing focus during the press ends the hold (4x CPU)', ({context}) =>
  pressResort(context, {offline: true, interrupt: (here) => here.evaluate(() => dispatchEvent(new FocusEvent('blur')))}, resortsWhilePressed))

test('a middle-button press holds nothing (4x CPU)', ({context}) => pressResort(context, {offline: true, button: 'middle'}, resortsWhilePressed))
