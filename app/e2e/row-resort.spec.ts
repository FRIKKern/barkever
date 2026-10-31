import {expect, test, type BrowserContext, type CDPSession, type Page} from '@playwright/test'
import {serverNote} from './devices'

const rows = '[data-testid=note-row]'
const row = (page: Page, id: string) => page.locator(`${rows}[data-note-id="${id}"]`)

type Press = {offline: boolean; resort?: boolean; button?: 'left' | 'middle'; touch?: boolean; interrupt?: (here: Page, target: string) => Promise<unknown>}
type Finger = {x: number; y: number; id: number}
type At = {y: number; finger: Finger; cdp: CDPSession}

const touch = (cdp: CDPSession, type: 'touchStart' | 'touchEnd', touchPoints: Finger[]) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints})
const painted = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const middle = (b: {x: number; y: number; width: number; height: number}, id: number) => ({x: b.x + b.width / 2, y: b.y + b.height / 2, id})

async function pressResort(context: BrowserContext, {offline, resort = true, button = 'left', touch: fingers = false, interrupt}: Press, then: (here: Page, ids: {target: string; mover: string}, at: At) => Promise<void>) {
  const [here, there] = [await context.newPage(), await context.newPage()]
  for (const p of [here, there]) {
    await p.goto('/')
    await expect(p.locator(rows)).toHaveCount(50, {timeout: 20_000})
  }
  const cdp = await context.newCDPSession(here)
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 4})
  if (fingers) await cdp.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 2})
  await context.setOffline(offline)
  const all = await here.locator(rows).evaluateAll((r) => r.map((x) => (x as HTMLElement).dataset.noteId!))
  const [target, mover] = [all[2], all[10]]
  const box = (await row(here, target).boundingBox())!
  await here.getByTestId('search').focus()
  const finger = middle(box, 1)
  if (fingers) await touch(cdp, 'touchStart', [finger])
  else {
    await here.mouse.move(finger.x, finger.y)
    await here.mouse.down({button})
  }
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
    await then(here, {target, mover}, {y: box.y, finger, cdp})
  } finally {
    if (resort) {
      await title.fill(was)
      if (!offline) await expect.poll(async () => (await serverNote(mover))?.title, {timeout: 15_000}).toBe(was)
    }
  }
}

const opensAfterResort = async (here: Page, {target, mover}: {target: string; mover: string}, {y}: At) => {
  expect((await row(here, target).boundingBox())!.y).toBe(y)
  await here.mouse.up()
  await expect(here).toHaveURL((u) => u.searchParams.get('n') === target, {timeout: 3_000})
  await expect(here.locator(rows).first()).toHaveAttribute('data-note-id', mover)
}

const secondFingerKeepsTheHold = async (here: Page, {target, mover}: {target: string; mover: string}, {y, finger, cdp}: At) => {
  await touch(cdp, 'touchStart', [finger, middle((await here.locator(rows).nth(6).boundingBox())!, 2)])
  await painted(here)
  expect((await row(here, target).boundingBox())!.y).toBe(y)
  await expect(here.locator(rows).first()).not.toHaveAttribute('data-note-id', mover)
  await touch(cdp, 'touchEnd', [])
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

test('a second finger pressed after a re-sort leaves the row under the first finger where it is (touch, 4x CPU)', ({context}) =>
  pressResort(context, {offline: true, touch: true}, secondFingerKeepsTheHold))
