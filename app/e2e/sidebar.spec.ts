import {expect, test, type Page} from '@playwright/test'
import {userToken} from './account'
import {prefIds, readPrefs, writePrefs} from './fixtures-cleanup'

const STARRED = {'fx-note-07': 'Quarry rebrand: moodboard', 'fx-note-02': 'Harbor redesign: wireframes'}
type Starred = keyof typeof STARRED

const starredOnServer = async (id: Starred) => (await prefIds(userToken(), 'shortcuts')).includes(id)
const starCall = (body: string, id: Starred) => body.includes(id) && body.includes('"on"')

function pendingStars(page: Page, set?: Record<string, boolean>): Promise<Record<string, boolean>> {
  return page.evaluate(async (set) => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open(name)
      r.onsuccess = () => ok(r.result)
    })
    const store = db.transaction('meta', 'readwrite').objectStore('meta')
    const got = await new Promise<Record<string, boolean>>((ok) => {
      const r = set ? store.put(set, 'stars') : store.get('stars')
      r.onsuccess = () => ok(set ?? r.result ?? {})
    })
    db.close()
    return got
  }, set)
}

async function openNote(page: Page, id: Starred) {
  await page.goto(`/?n=${id}`)
  await expect(page.getByTestId('title')).toHaveValue(STARRED[id])
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
  expect(await pendingStars(page)).toEqual({'fx-note-07': on})
  await context.setOffline(false)
  await expect.poll(onServer).toBe(on)
  await expect.poll(() => pendingStars(page)).toEqual({})
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

test('two tabs: a star send held in one tab never undoes a later unstar in the other', async ({context}) => {
  await unstarOnServer('fx-note-07', 'fx-note-02')
  const one = await context.newPage()
  await openNote(one, 'fx-note-07')
  await pendingStars(one, {'fx-note-07': true, 'fx-note-02': true})
  let release = () => {}
  const held = new Promise<void>((ok) => (release = ok))
  await one.route('**/_serverFn/**', async (route) => {
    if (starCall(route.request().postData() ?? '', 'fx-note-07')) await held
    await route.continue()
  })
  await one.reload()

  const two = await context.newPage()
  await openNote(two, 'fx-note-02')
  const star = two.getByTestId('star')
  await expect(star).toHaveAttribute('aria-pressed', 'true')
  await star.click()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  release()
  await expect.poll(() => pendingStars(one)).toEqual({})
  expect(await starredOnServer('fx-note-02')).toBe(false)
  expect(await starredOnServer('fx-note-07')).toBe(true)
  await two.reload()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
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
  await writePrefs(userToken(), kept)
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
