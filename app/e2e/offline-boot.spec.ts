import {randomBytes} from 'node:crypto'
import {expect, test, type Page} from '@playwright/test'
import {ORIGIN, build, serve, stop} from './own-server'
import {deleteNotes} from './fixtures-cleanup'

test.describe.configure({mode: 'serial', timeout: 120_000})

test.beforeAll(() => {
  build('a')
  build('b')
})
test.afterEach(stop)

const kept = (page: Page) =>
  page.evaluate(async () => ({
    controlled: !!navigator.serviceWorker.controller,
    caches: await caches.keys(),
    shell: (await (await caches.match('/'))?.text())?.match(/name="barkever-build" content="([^"]+)"/)?.[1] ?? null,
    editor: !!(await caches.match('/editor-files')),
  }))

const servedBuild = (page: Page) => page.locator('meta[name="barkever-build"]').getAttribute('content')

const rows = (page: Page) => page.getByTestId('note-row')

const READ_ONLY = 'Read only: the editor could not load (offline, and it is not on this device yet).'

async function loadOnline(page: Page) {
  await page.goto(ORIGIN)
  await expect(rows(page).first()).toBeVisible({timeout: 30_000})
}

test('offline cold start: a new tab shows the signed-in user’s notes from the replica, and a note opens', async ({context}, info) => {
  await serve('a')
  const page = await context.newPage()
  await loadOnline(page)
  await expect.poll(() => kept(page)).toEqual({controlled: true, caches: ['barkever-a'], shell: 'a', editor: true})
  await stop()
  await context.setOffline(true)

  const cold = await context.newPage()
  const errors: string[] = []
  cold.on('pageerror', (e) => errors.push(e.message))
  await cold.goto(ORIGIN)
  await expect(rows(cold).first()).toBeVisible()
  expect(await rows(cold).count()).toBeGreaterThanOrEqual(50)
  await rows(cold).filter({hasText: 'Harbor redesign: sitemap'}).click()
  await expect(cold.getByTestId('title')).toHaveValue('Harbor redesign: sitemap')
  await expect(cold.getByTestId('canvas')).toBeVisible()
  await cold.screenshot({path: info.outputPath('offline-boot.png')})
  expect(errors).toEqual([])

  await cold.evaluate(async () => (await caches.open('barkever-a')).delete('/editor-files'))
  const bare = await context.newPage()
  await bare.goto(`${ORIGIN}/?n=fx-note-01`)
  await expect(bare.getByTestId('body')).toContainText(READ_ONLY)
})

async function editorUncached(page: Page) {
  await loadOnline(page)
  await expect.poll(() => kept(page)).toMatchObject({controlled: true, editor: true})
  await page.evaluate(async () => (await caches.open('barkever-a')).delete('/editor-files'))
  await stop()
}

async function editable(page: Page) {
  await expect(page.getByTestId('canvas').locator('[contenteditable="true"]')).toBeVisible({timeout: 10_000})
  await expect(page.getByTestId('body')).not.toContainText('Read only')
}

test('a note opened offline before the editor is on the device turns editable when the network returns, without a reload', async ({context}, info) => {
  await serve('a')
  await editorUncached(await context.newPage())
  await context.setOffline(true)
  const page = await context.newPage()
  await page.goto(`${ORIGIN}/?n=fx-note-01`)
  await expect(page.getByTestId('body')).toContainText(READ_ONLY)
  await page.evaluate(() => Object.assign(window, {sameDocument: true}))
  await serve('a')
  await context.setOffline(false)
  await editable(page)
  expect(await page.evaluate(() => 'sameDocument' in window)).toBe(true)
  await page.screenshot({path: info.outputPath('offline-retry-online.png')})
})

test('Barkpark comes back while the browser stays online: the open note turns editable with no click', async ({context}, info) => {
  await serve('a')
  await editorUncached(await context.newPage())
  const page = await context.newPage()
  await page.goto(`${ORIGIN}/?n=fx-note-01`)
  await expect(page.getByTestId('body')).toContainText('Read only: the editor could not load (can’t reach Barkpark, and it is not on this device yet).')
  await page.screenshot({path: info.outputPath('cant-reach-read-only.png')})
  await page.evaluate(() => Object.assign(window, {sameDocument: true}))
  await serve('a')
  await editable(page)
  expect(await page.evaluate(() => 'sameDocument' in window)).toBe(true)
})

test('online but the server is gone: the app says it can’t reach Barkpark and keeps the change on the device', async ({context}) => {
  await serve('a')
  const page = await context.newPage()
  await loadOnline(page)
  const foot = page.getByTestId('sync-status')
  await expect(foot).toHaveText('Synced', {timeout: 15_000})
  await page.keyboard.press('n')
  const title = page.getByTestId('title')
  await expect(title).toBeFocused()
  const id = new URL(page.url()).searchParams.get('n')!
  await stop()
  await title.pressSequentially('Typed while the server is gone')
  await expect(page.getByTestId('offline')).toHaveText('Can’t reach Barkpark. Changes stay on this device until it answers.', {timeout: 15_000})
  await expect(foot).toHaveText('Can’t reach Barkpark · 1 to sync')
  await expect(page.getByTestId('save-status')).toHaveText('Saved on this device')
  await serve('a')
  await expect(foot).toHaveText('Synced', {timeout: 20_000})
  await expect(page.getByTestId('offline')).toHaveCount(0)
  await deleteNotes([id])
})

test('a new deploy replaces the cached shell on the next online load', async ({context}) => {
  const page = await context.newPage()
  await serve('a')
  await loadOnline(page)
  await expect.poll(() => kept(page)).toMatchObject({controlled: true, caches: ['barkever-a'], shell: 'a'})
  await stop()

  await serve('b')
  await loadOnline(page)
  expect(await servedBuild(page)).toBe('b')
  await expect.poll(() => kept(page)).toMatchObject({controlled: true, caches: ['barkever-b'], shell: 'b'})
  await stop()

  await context.setOffline(true)
  const cold = await context.newPage()
  await cold.goto(ORIGIN)
  await expect(rows(cold).first()).toBeVisible()
  expect(await servedBuild(cold)).toBe('b')
})

test('back online with an ended session: sign-in, and the replica stays until sign-out', async ({context}) => {
  await serve('a')
  const page = await context.newPage()
  await loadOnline(page)
  await expect.poll(() => kept(page)).toMatchObject({controlled: true, shell: 'a'})
  await stop()
  await context.setOffline(true)
  const cold = await context.newPage()
  await cold.goto(ORIGIN)
  await expect(rows(cold).first()).toBeVisible()

  await serve('a', {secret: randomBytes(32).toString('base64url')})
  await context.setOffline(false)
  await expect(cold).toHaveURL(/\/sign-in/)
  expect((await cold.evaluate(() => indexedDB.databases())).filter((d) => d.name?.startsWith('barkever-'))).toHaveLength(1)
})
