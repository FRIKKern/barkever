import {expect, test, type BrowserContext} from '@playwright/test'

const rows = '[data-testid=note-row]'

async function pressResortRelease(context: BrowserContext, {resort, offline}: {resort: boolean; offline: boolean}) {
  const [here, there] = [await context.newPage(), await context.newPage()]
  for (const p of [here, there]) {
    await p.goto('/')
    await expect(p.locator(rows)).toHaveCount(50, {timeout: 20_000})
  }
  await (await context.newCDPSession(here)).send('Emulation.setCPUThrottlingRate', {rate: 4})
  await context.setOffline(offline)
  const ids = await here.locator(rows).evaluateAll((r) => r.map((x) => (x as HTMLElement).dataset.noteId!))
  const [target, mover] = [ids[2], ids[10]]
  const box = (await here.locator(`${rows}[data-note-id="${target}"]`).boundingBox())!
  await here.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await here.mouse.down()
  await there.locator(`${rows}[data-note-id="${mover}"]`).click()
  const title = there.getByTestId('title')
  const was = await title.inputValue()
  try {
    if (resort) {
      const moved = `moved by the other tab ${Date.now()}`
      await title.fill(moved)
      await expect(here.locator(`${rows}[data-note-id="${mover}"] [data-testid=note-title]`)).toHaveText(moved)
      expect((await here.locator(`${rows}[data-note-id="${target}"]`).boundingBox())!.y).toBe(box.y)
    }
    await here.mouse.up()
    await expect(here).toHaveURL((u) => u.searchParams.get('n') === target, {timeout: 3_000})
    if (resort) await expect(here.locator(rows).first()).toHaveAttribute('data-note-id', mover)
  } finally {
    if (resort) await title.fill(was)
  }
}

for (const offline of [true, false]) {
  const how = offline ? 'offline' : 'online'
  test(`control: press and release on a row opens it while another tab is busy (${how}, 4x CPU)`, ({context}) => pressResortRelease(context, {resort: false, offline}))
  test(`a row click survives the list re-sorting between press and release (a save from another tab, ${how}, 4x CPU)`, ({context}) => pressResortRelease(context, {resort: true, offline}))
}
