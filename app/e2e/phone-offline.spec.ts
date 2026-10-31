import {expect, test, type Locator, type Page} from '@playwright/test'

test.use({colorScheme: 'dark'})

const rect = (l: Locator) =>
  l.evaluate((e) => {
    const box = e.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(e)
    const text = range.getBoundingClientRect()
    return {top: box.top, bottom: box.bottom, clipped: e.scrollHeight - e.clientHeight, room: Math.round(Math.min(text.top - box.top, box.bottom - text.bottom))}
  })

async function layout(page: Page, where: string, bar: string) {
  const banner = await rect(page.getByTestId('offline'))
  const head = await rect(page.locator(bar))
  const overlap = Math.max(0, Math.round(Math.min(banner.bottom, head.bottom) - Math.max(banner.top, head.top)))
  const text = banner.clipped > 0 ? `its text is cut by ${banner.clipped}px` : banner.room < 4 ? `its text has ${banner.room}px to the edge` : 'its text fits'
  return `${where}: banner covers ${overlap}px of the bar, ${text}`
}

const reachable = (l: Locator) =>
  l.evaluate((e) => {
    const r = e.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return e.contains(hit) ? 'clickable' : `under ${hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? hit?.className}`
  })

async function offline(page: Page) {
  await page.goto('/?n=fx-note-01')
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: sitemap')
  await page.context().setOffline(true)
  await expect(page.getByTestId('offline')).toHaveText(/^Offline\./)
}

test.describe('at 390 px', () => {
  test.use({viewport: {width: 390, height: 844}})

  test('offline on a phone, the banner takes its own space: the top bar stays whole and its buttons answer, scrolled or not', async ({page}) => {
    await offline(page)
    const scroll = (y: number) => page.locator('.app').evaluate((e, y) => e.scrollTo(0, y), y)
    const menu = page.getByRole('button', {name: 'Notebooks'})
    const title = page.locator('.list .mhead .mt')
    const back = page.locator('.editor .mhead .back')
    const facts: string[] = []

    facts.push(await layout(page, 'note', '.editor .mhead'), `back ${await reachable(back)}`)
    await page.screenshot({path: test.info().outputPath('offline-note-dark-390.png')})
    await scroll(400)
    facts.push(await layout(page, 'note scrolled', '.editor .mhead'), `back scrolled ${await reachable(back)}`)

    await back.click()
    await expect(menu).toBeVisible()
    facts.push(await layout(page, 'list', '.list .mhead'), `menu ${await reachable(menu)}`, `title ${await reachable(title)}`)
    await scroll(600)
    facts.push(await layout(page, 'list scrolled', '.list .mhead'), `menu scrolled ${await reachable(menu)}`, `title scrolled ${await reachable(title)}`)
    await page.screenshot({path: test.info().outputPath('offline-list-scrolled-dark-390.png')})

    expect(facts).toEqual([
      'note: banner covers 0px of the bar, its text fits',
      'back clickable',
      'note scrolled: banner covers 0px of the bar, its text fits',
      'back scrolled clickable',
      'list: banner covers 0px of the bar, its text fits',
      'menu clickable',
      'title clickable',
      'list scrolled: banner covers 0px of the bar, its text fits',
      'menu scrolled clickable',
      'title scrolled clickable',
    ])
    await menu.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.context().setOffline(false)
  })
})

test('offline on a desktop, the banner keeps its own row above the columns', async ({page}) => {
  await page.setViewportSize({width: 1440, height: 900})
  await offline(page)
  expect([await layout(page, 'list', '.list .bar'), await layout(page, 'editor', '.editor .ed-bar')]).toEqual([
    'list: banner covers 0px of the bar, its text fits',
    'editor: banner covers 0px of the bar, its text fits',
  ])
  await page.screenshot({path: test.info().outputPath('offline-dark-1440.png')})
  await page.context().setOffline(false)
})
