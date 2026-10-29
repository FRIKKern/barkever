import {expect, test, type Page} from '@playwright/test'
import {userToken} from './account'
import {prefIds, readPrefs, writePrefs} from './fixtures-cleanup'

const STARRED = {'fx-note-07': 'Quarry rebrand: moodboard', 'fx-note-02': 'Harbor redesign: wireframes'}
type Starred = keyof typeof STARRED

const starredOnServer = async (id: Starred) => (await prefIds(userToken(), 'shortcuts')).includes(id)
const starCall = (body: string, id: Starred) => body.includes(id) && body.includes('"on"')

function meta<T>(page: Page, key: string, set?: T): Promise<T | undefined> {
  return page.evaluate(
    async ({key, set}) => {
      const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
      const db = await new Promise<IDBDatabase>((ok) => {
        const r = indexedDB.open(name)
        r.onsuccess = () => ok(r.result)
      })
      const store = db.transaction('meta', 'readwrite').objectStore('meta')
      const got = await new Promise<T | undefined>((ok) => {
        const r = set ? store.put(set, key) : store.get(key)
        r.onsuccess = () => ok(set ?? r.result)
      })
      db.close()
      return got
    },
    {key, set},
  )
}

const pendingStars = async (page: Page, set?: Record<string, boolean>) => (await meta(page, 'stars', set)) ?? {}
const keptShortcuts = async (page: Page) => (await meta<{shortcuts: string[]}>(page, 'prefs'))?.shortcuts ?? []

async function openNote(page: Page, id: Starred) {
  await page.goto(`/?n=${id}`)
  await expect(page.getByTestId('title')).toHaveValue(STARRED[id])
}

function warnings(page: Page) {
  const seen: string[] = []
  page.on('console', (m) => m.type() === 'warning' && seen.push(m.text()))
  return seen
}

async function unstarOnServer(...ids: Starred[]) {
  const now = await readPrefs(userToken())
  await writePrefs(userToken(), {...now, shortcuts: now.shortcuts.filter((x) => !ids.includes(x as Starred))})
}

let kept: Awaited<ReturnType<typeof readPrefs>>
test.beforeAll(async () => (kept = await readPrefs(userToken())))
test.afterAll(async () => {
  await writePrefs(userToken(), kept)
  expect(await readPrefs(userToken())).toEqual(kept)
})

test('offline shows one quiet line and the sync dot; back online clears both', async ({page, context}) => {
  await page.goto('/?n=fx-note-01')
  await expect(page.getByTestId('title')).toBeVisible()
  await expect(page.getByTestId('offline')).toHaveCount(0)
  await context.setOffline(true)
  await expect(page.getByTestId('offline')).toHaveText(/^Offline\./)
  await expect(page.locator('.side-foot')).toContainText('Offline')
  await context.setOffline(false)
  await expect(page.getByTestId('offline')).toHaveCount(0)
  await expect(page.locator('.side-foot')).toContainText('Synced')
})

test('a starred note sits in Shortcuts and an opened note in Recent, both kept in Barkpark prefs', async ({page}) => {
  await page.goto('/?n=fx-note-02')
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: wireframes')
  const star = page.getByTestId('star')
  const shortcut = page.getByTestId('side-shortcut').filter({hasText: 'Harbor redesign: wireframes'})
  const wasStarred = (await star.getAttribute('aria-pressed')) === 'true'
  await star.click()
  await expect(shortcut).toHaveCount(wasStarred ? 0 : 1)
  await expect(page.getByTestId('side-recent').first()).toHaveText('Harbor redesign: wireframes')

  await page.waitForTimeout(1_500)
  await page.reload()
  await expect(shortcut).toHaveCount(wasStarred ? 0 : 1)
  await expect(page.getByTestId('side-recent').first()).toHaveText('Harbor redesign: wireframes')

  await page.getByTestId('star').click()
  await expect(shortcut).toHaveCount(wasStarred ? 1 : 0)
  await page.waitForTimeout(1_500)
})

test('a star set offline survives reconnect and reload; a star whose answer was lost replays once, to the same state', async ({page, context}) => {
  await openNote(page, 'fx-note-07')
  const star = page.getByTestId('star')
  const shortcut = page.getByTestId('side-shortcut').filter({hasText: STARRED['fx-note-07']})
  const onServer = () => starredOnServer('fx-note-07')
  const on = (await star.getAttribute('aria-pressed')) !== 'true'

  await context.setOffline(true)
  const failed = page.waitForEvent('requestfailed', (r) => starCall(r.postData() ?? '', 'fx-note-07'))
  await star.click()
  await expect(shortcut).toHaveCount(on ? 1 : 0)
  await failed
  await page.waitForEvent('requestfailed', (r) => starCall(r.postData() ?? '', 'fx-note-07'))
  expect(await pendingStars(page)).toEqual({'fx-note-07': on})
  await context.setOffline(false)
  await expect.poll(onServer, {timeout: 1_500}).toBe(on)
  await expect.poll(() => pendingStars(page)).toEqual({})
  expect((await keptShortcuts(page)).includes('fx-note-07')).toBe(on)
  await page.reload()
  await expect(star).toHaveAttribute('aria-pressed', String(on))
  await expect(shortcut).toHaveCount(on ? 1 : 0)

  let lost = 0
  let replayed = 0
  await page.route('**/_serverFn/**', async (route) => {
    if (!starCall(route.request().postData() ?? '', 'fx-note-07')) return route.continue()
    if (lost) return replayed++, route.continue()
    lost++
    await route.fetch()
    await route.abort()
  })
  await star.click()
  await expect.poll(onServer).toBe(!on)
  expect(lost).toBe(1)
  expect(await pendingStars(page)).toEqual({'fx-note-07': !on})
  await page.reload()
  await expect(star).toHaveAttribute('aria-pressed', String(!on))
  await expect(shortcut).toHaveCount(on ? 0 : 1)
  await expect.poll(() => replayed).toBe(1)
  await expect.poll(() => pendingStars(page)).toEqual({})
  await page.reload()
  await expect(star).toHaveAttribute('aria-pressed', String(!on))
  expect(replayed).toBe(1)
  expect(await onServer()).toBe(!on)
})

test('unstarring while the star is still on its way ends unstarred, with nothing left to send', async ({page}) => {
  await unstarOnServer('fx-note-07')
  await openNote(page, 'fx-note-07')
  const star = page.getByTestId('star')
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  let release = () => {}
  const held = new Promise<void>((ok) => (release = ok))
  let calls = 0
  await page.route('**/_serverFn/**', async (route) => {
    if (!starCall(route.request().postData() ?? '', 'fx-note-07') || calls++) return route.continue()
    const answer = await route.fetch()
    await held
    await route.fulfill({response: answer})
  })
  await star.click()
  await expect.poll(() => starredOnServer('fx-note-07')).toBe(true)
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  release()
  await expect.poll(() => starredOnServer('fx-note-07')).toBe(false)
  await expect.poll(() => pendingStars(page)).toEqual({})
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  expect(calls).toBe(2)
})

for (const held of ['fx-note-07', 'fx-note-02'] as const)
  test(`two tabs: a star send for ${held} held in one tab never undoes a later unstar in the other`, async ({context}) => {
    await unstarOnServer('fx-note-07', 'fx-note-02')
    const one = await context.newPage()
    await openNote(one, 'fx-note-07')
    await pendingStars(one, {'fx-note-07': true, 'fx-note-02': true})
    let release = () => {}
    const holding = new Promise<void>((ok) => (release = ok))
    let reached = () => {}
    const sentFromOne = new Promise<void>((ok) => (reached = ok))
    await one.route('**/_serverFn/**', async (route) => {
      if (starCall(route.request().postData() ?? '', held)) reached(), await holding
      await route.continue()
    })
    await one.reload()
    await sentFromOne

    const two = await context.newPage()
    await openNote(two, 'fx-note-02')
    const star = two.getByTestId('star')
    await expect(star).toHaveAttribute('aria-pressed', 'true')
    const after: string[] = []
    for (const p of [one, two]) p.on('request', (r) => starCall(r.postData() ?? '', 'fx-note-02') && after.push(p === one ? 'one' : 'two'))
    await star.click()
    await expect(star).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(async () => (await pendingStars(two))['fx-note-02']).toBe(false)
    release()
    await expect.poll(() => pendingStars(one)).toEqual({})
    await expect.poll(() => starredOnServer('fx-note-02')).toBe(false)
    expect(await starredOnServer('fx-note-07')).toBe(true)
    expect(after, 'after the unstar, 02 goes out once, already off').toHaveLength(1)
    await two.reload()
    await expect(star).toHaveAttribute('aria-pressed', 'false')
  })

test('a change made in another tab while this tab reads prefs shows when the read lands', async ({context}) => {
  await unstarOnServer('fx-note-07')
  const two = await context.newPage()
  await openNote(two, 'fx-note-07')
  const twoStar = two.getByTestId('star')
  await twoStar.click()
  await expect.poll(() => starredOnServer('fx-note-07')).toBe(true)
  await expect.poll(() => pendingStars(two)).toEqual({})

  const one = await context.newPage()
  let fetched = () => {}
  const readTaken = new Promise<void>((ok) => (fetched = ok))
  let release = () => {}
  const holding = new Promise<void>((ok) => (release = ok))
  let held = 0
  await one.route('**/_serverFn/**', async (route) => {
    if (route.request().method() !== 'GET' || held) return route.continue()
    const answer = await route.fetch()
    if (!(await answer.text()).includes('recents')) return route.fulfill({response: answer})
    held++
    fetched()
    await holding
    await route.fulfill({response: answer})
  })
  await two.route('**/_serverFn/**', (route) => (starCall(route.request().postData() ?? '', 'fx-note-07') ? route.abort() : route.continue()))
  const going = one.goto('/?n=fx-note-07')
  await readTaken
  await twoStar.click()
  await expect.poll(() => pendingStars(two)).toEqual({'fx-note-07': false})
  release()
  await going
  await expect(one.getByTestId('title')).toHaveValue(STARRED['fx-note-07'])
  await expect(one.getByTestId('star')).toHaveAttribute('aria-pressed', 'false')
  await two.unrouteAll({behavior: 'wait'})
  await expect.poll(() => starredOnServer('fx-note-07'), {timeout: 15_000}).toBe(false)
  await expect.poll(() => pendingStars(two)).toEqual({})
})

test('a malformed star call changes nothing on Barkpark', async ({page}) => {
  await unstarOnServer('fx-note-07')
  await openNote(page, 'fx-note-07')
  const call = page.waitForRequest((r) => starCall(r.postData() ?? '', 'fx-note-07'))
  await page.getByTestId('star').click()
  const good = await call
  await expect.poll(() => starredOnServer('fx-note-07')).toBe(true)
  await page.getByTestId('star').click()
  await expect.poll(() => starredOnServer('fx-note-07')).toBe(false)
  await expect.poll(() => pendingStars(page)).toEqual({})
  const body = good.postData()!
  const id = '{"t":1,"s":"fx-note-07"}'
  const on = /\{"t":2,"s":\d+\}/
  expect(body).toContain(id)
  expect(body).toMatch(on)
  for (const bad of [body.replace(on, '{"t":1,"s":"yes"}'), body.replace(id, '{"t":0,"s":7}').replace(on, '{"t":0,"s":1}')]) {
    expect(bad).not.toBe(body)
    const res = await page.request.post(good.url(), {data: bad, headers: good.headers()})
    expect(res.ok() && !/error/i.test(await res.text()), `${res.status()} for ${bad}`).toBe(false)
  }
  expect(await starredOnServer('fx-note-07')).toBe(false)
})

test('a star Barkpark refuses for good is dropped and never blocks the next one', async ({page}) => {
  const size = (ids: string[]) => JSON.stringify({v: 1, ids}).length
  const ids = ['fx-note-02']
  while (size(ids) < 16_300) ids.push(`fx-pad-${ids.length}`)
  ids.push(`fx-pad-${'x'.repeat(16_380 - size(ids) - 10)}`)
  expect(size(ids)).toBe(16_380)
  await writePrefs(userToken(), {shortcuts: ids, recents: kept.recents})
  const sent: string[] = []
  page.on('request', (r) => r.url().includes('/_serverFn/') && starCall(r.postData() ?? '', 'fx-note-07') && sent.push(r.url()))
  const warned = warnings(page)

  await openNote(page, 'fx-note-07')
  const star = page.getByTestId('star')
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await star.click()
  await expect.poll(() => pendingStars(page)).toEqual({})
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await openNote(page, 'fx-note-02')
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await star.click()
  await expect.poll(() => starredOnServer('fx-note-02')).toBe(false)
  await expect.poll(() => pendingStars(page)).toEqual({})
  await page.reload()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  expect(await starredOnServer('fx-note-07')).toBe(false)
  expect(sent).toHaveLength(1)
  expect(warned.filter((w) => w.startsWith('stars: Barkpark refused starring fx-note-07 (422)'))).toHaveLength(1)
  await writePrefs(userToken(), kept)
})

test('a star that fails for a while (signed out, then a 503 twice) stays queued and retries on its own, backing off', async ({page, context}) => {
  await unstarOnServer('fx-note-07')
  await openNote(page, 'fx-note-07')
  const star = page.getByTestId('star')
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  const warned = warnings(page)
  const session = await context.cookies()
  await context.clearCookies()
  await star.click()
  await expect.poll(() => warned.filter((w) => w.startsWith('stars: fx-note-07 did not reach Barkpark')).length).toBe(1)
  expect(await pendingStars(page)).toEqual({'fx-note-07': true})
  expect(await starredOnServer('fx-note-07')).toBe(false)
  await context.addCookies(session)
  await expect.poll(() => starredOnServer('fx-note-07'), {timeout: 10_000}).toBe(true)
  await expect.poll(() => pendingStars(page)).toEqual({})

  const at: number[] = []
  await page.route('**/_serverFn/**', async (route) => {
    if (!starCall(route.request().postData() ?? '', 'fx-note-07')) return route.continue()
    at.push(Date.now())
    if (at.length <= 2) return route.fulfill({status: 503, body: 'unavailable'})
    await route.continue()
  })
  await star.click()
  await expect.poll(() => starredOnServer('fx-note-07'), {timeout: 15_000}).toBe(false)
  expect(at).toHaveLength(3)
  expect(at[1] - at[0]).toBeGreaterThanOrEqual(1_800)
  expect(at[2] - at[1]).toBeGreaterThanOrEqual(3_800)
  await expect.poll(() => pendingStars(page)).toEqual({})
  await expect(star).toHaveAttribute('aria-pressed', 'false')
})

test('a star that keeps failing never holds back another one', async ({page}) => {
  await unstarOnServer('fx-note-07', 'fx-note-02')
  await openNote(page, 'fx-note-07')
  await page.route('**/_serverFn/**', (route) => (starCall(route.request().postData() ?? '', 'fx-note-07') ? route.fulfill({status: 503, body: 'unavailable'}) : route.continue()))
  await pendingStars(page, {'fx-note-07': true, 'fx-note-02': true})
  await page.reload()
  await expect.poll(() => starredOnServer('fx-note-02')).toBe(true)
  await expect.poll(() => pendingStars(page)).toEqual({'fx-note-07': true})
  expect(await starredOnServer('fx-note-07')).toBe(false)
  await page.unrouteAll({behavior: 'wait'})
  await expect.poll(() => starredOnServer('fx-note-07'), {timeout: 15_000}).toBe(true)
  await expect.poll(() => pendingStars(page)).toEqual({})
})

test('a star acked while the prefs read is in flight still shows once the read lands', async ({page}) => {
  await unstarOnServer('fx-note-07')
  await openNote(page, 'fx-note-07')
  await pendingStars(page, {'fx-note-07': true})
  let fetched = () => {}
  const readTaken = new Promise<void>((ok) => (fetched = ok))
  let acked = () => {}
  const starLanded = new Promise<void>((ok) => (acked = ok))
  let held = 0
  await page.route('**/_serverFn/**', async (route) => {
    const r = route.request()
    if (starCall(r.postData() ?? '', 'fx-note-07')) {
      await readTaken
      const answer = await route.fetch()
      acked()
      return route.fulfill({response: answer})
    }
    if (r.method() !== 'GET' || held) return route.continue()
    const answer = await route.fetch()
    if (!(await answer.text()).includes('recents')) return route.fulfill({response: answer})
    held++
    fetched()
    await starLanded
    await expect.poll(() => pendingStars(page)).toEqual({})
    await route.fulfill({response: answer})
  })
  await page.reload()
  await expect(page.getByTestId('title')).toHaveValue(STARRED['fx-note-07'])
  expect(held).toBe(1)
  await expect.poll(() => starredOnServer('fx-note-07')).toBe(true)
  await expect.poll(() => pendingStars(page)).toEqual({})
  await expect(page.getByTestId('star')).toHaveAttribute('aria-pressed', 'true')
  await page.unrouteAll({behavior: 'wait'})
})

test('the theme toggle flips light and dark and remembers the pick', async ({page}) => {
  await page.emulateMedia({colorScheme: 'dark'})
  await page.goto('/')
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const dark = await bg()
  await page.getByRole('button', {name: 'Toggle theme'}).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const light = await bg()
  expect(light).not.toBe(dark)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await bg()).toBe(light)
})
