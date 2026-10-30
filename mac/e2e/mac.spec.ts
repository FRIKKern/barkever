import {expect, test, type Browser, type ElectronApplication, type Page} from '@playwright/test'
import {mkdtempSync, readdirSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ACCOUNT} from '../../app/e2e/account.ts'
import {DATASET, barkpark, deleteNotes} from '../../app/e2e/fixtures-cleanup.ts'
import {freePort} from '../src/port.ts'
import {keepTraceOnFailure, launchDriven, launchPlain} from './launch.ts'

test.describe.configure({mode: 'serial'})

const profile = () => mkdtempSync(join(tmpdir(), 'barkever-mac-e2e-'))
const DATA = profile()
const NOTE = 'Harbor redesign: sitemap'

const created: string[] = []
test.afterAll(() => deleteNotes(created))
test.afterEach(({}, info) => keepTraceOnFailure(info))

const rows = (page: Page) => page.getByTestId('note-row')
const noteId = (page: Page) => new URL(page.url()).searchParams.get('n')

type Kept = {secret: string; session?: string}
const vault = (app: ElectronApplication) =>
  app.evaluate(({safeStorage}, file) => JSON.parse(safeStorage.decryptString(process.getBuiltinModule('node:fs').readFileSync(file))) as Kept, join(DATA, 'vault.bin'))

const holding = (dir: string, needle: string) =>
  readdirSync(dir, {recursive: true, withFileTypes: true})
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name))
    .filter((f) => readFileSync(f).includes(needle))

async function signIn(page: Page) {
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/sign-in/, {timeout: 30_000})
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(ACCOUNT.email)
  await page.getByLabel('Password').fill(ACCOUNT.password)
  await page.getByRole('button', {name: 'Sign in'}).click()
  await expect(rows(page).first()).toBeVisible({timeout: 30_000})
}

async function signOut(page: Page) {
  page.on('dialog', (d) => void d.accept())
  await page.getByTestId('sign-out').click()
  await expect(page).toHaveURL(/\/sign-in/)
}

async function cookieInJar(browser: Browser) {
  const cdp = await browser.newBrowserCDPSession()
  const {cookies} = (await cdp.send('Storage.getCookies')) as {cookies: {name: string; value: string; session: boolean}[]}
  return cookies.find((c) => c.name === 'bk_session')
}

async function onServer(id: string) {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=drafts&limit=1000`)
  const {result} = (await res.json()) as {result: {documents: {_id: string; title?: string}[]}}
  return result.documents.find((d) => d._id.replace(/^drafts\./, '') === id)?.title
}

async function capture(page: Page, how: () => Promise<unknown>, title: string) {
  const before = noteId(page)
  await how()
  await expect.poll(() => noteId(page)).not.toBe(before)
  await expect(page.getByTestId('title')).toBeFocused()
  created.push(noteId(page)!)
  await page.keyboard.type(title)
  await expect(page.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
  await expect.poll(() => onServer(noteId(page)!), {timeout: 15_000}).toBe(title)
}

const kept = (page: Page) =>
  page.evaluate(async () => !!navigator.serviceWorker.controller && !!(await caches.match('/')) && !!(await caches.match('/editor-files')))

let origin = ''

test('criterion 0 + 2: the app serves itself; sign in, list, open, edit; Cmd-N and File › New Note; nothing secret on disk', async ({}, info) => {
  const app = await launchDriven(DATA)
  const page = await app.firstWindow()
  await signIn(page)
  origin = new URL(page.url()).origin
  expect(await rows(page).count()).toBeGreaterThanOrEqual(50)

  await rows(page).filter({hasText: NOTE}).click()
  await expect(page.getByTestId('title')).toHaveValue(NOTE)
  await expect(page.getByTestId('canvas')).toBeVisible()

  await capture(page, () => page.keyboard.press('Meta+N'), `Mac Cmd-N ${Date.now()}`)
  await capture(page, () => app.evaluate(({Menu}) => Menu.getApplicationMenu()?.getMenuItemById('new-note')?.click()), `Mac File menu ${Date.now()}`)

  await rows(page).filter({hasText: NOTE}).click()
  await expect(page.getByTestId('title')).toHaveValue(NOTE)
  await expect.poll(() => kept(page), {timeout: 20_000}).toBe(true)
  await page.screenshot({path: info.outputPath('mac-online.png')})

  const jar = await app.evaluate(({session}) => session.defaultSession.cookies.get({name: 'bk_session'}))
  expect(jar).toHaveLength(1)
  expect(jar[0]).toMatchObject({session: true, httpOnly: true})
  expect(jar[0]!.expirationDate).toBeUndefined()
  const v = await vault(app)
  expect(v.session).toBe(jar[0]!.value)
  expect(v.secret.length).toBeGreaterThanOrEqual(32)

  await app.close()
  expect(holding(DATA, jar[0]!.value)).toEqual([])
  expect(holding(DATA, v.secret)).toEqual([])
  expect(holding(DATA, ACCOUNT.password)).toEqual([])
})

test('criterion 1: quit, go offline, relaunch: same origin, the notes show from the replica', async ({}, info) => {
  const run = await launchPlain(DATA, 'mock', {BARKPARK_URL: `http://127.0.0.1:${await freePort()}`})
  const {page} = run
  await expect(rows(page).first()).toBeVisible({timeout: 30_000})
  expect(new URL(page.url()).origin).toBe(origin)
  expect(await rows(page).count()).toBeGreaterThanOrEqual(52)

  await page.context().setOffline(true)
  await page.reload()
  expect(await page.evaluate(() => fetch('/sign-in', {cache: 'no-store'}).then(() => 'reached', () => 'blocked'))).toBe('blocked')
  await expect(rows(page).first()).toBeVisible()
  expect(await rows(page).count()).toBeGreaterThanOrEqual(52)
  await rows(page).filter({hasText: NOTE}).click()
  await expect(page.getByTestId('title')).toHaveValue(NOTE)
  await expect(page.getByTestId('canvas')).toBeVisible()
  await page.screenshot({path: info.outputPath('mac-offline.png')})
  await run.quit()
})

test('criterion 2: the next launch is signed in from the vault; after sign-out it is not', async () => {
  const first = await launchPlain(DATA, 'mock')
  await expect(rows(first.page).first()).toBeVisible({timeout: 30_000})
  expect(new URL(first.page.url()).origin).toBe(origin)
  expect(await cookieInJar(first.browser)).toMatchObject({session: true})
  await signOut(first.page)
  expect(await cookieInJar(first.browser)).toBeUndefined()
  await first.quit()

  const after = await launchPlain(DATA, 'mock')
  await expect(after.page).toHaveURL(/\/sign-in/)
  await after.quit()
})

test('criterion 2 on the real Keychain: sign in, quit, relaunch signed in, cookie only in the vault', async () => {
  const data = profile()
  const first = await launchPlain(data, 'real')
  await signIn(first.page)
  const cookie = (await cookieInJar(first.browser))!
  expect(cookie.session).toBe(true)
  await first.quit()
  expect(holding(data, cookie.value)).toEqual([])

  const again = await launchPlain(data, 'real')
  await expect(rows(again.page).first()).toBeVisible({timeout: 30_000})
  expect((await cookieInJar(again.browser))?.value).toBe(cookie.value)
  await signOut(again.page)
  await again.quit()
})

test('a window that commits while the worker claims is still kept for offline', async () => {
  let install = () => {}
  const installing = new Promise<void>((ok) => (install = ok))
  let claimed = () => {}
  const claim = new Promise<void>((ok) => (claimed = ok))
  let signingIn = false
  const app = await launchDriven(profile())
  await app.context().route('**/*', async (route) => {
    const r = route.request()
    const path = new URL(r.url()).pathname
    if (r.serviceWorker() && path.startsWith('/assets/')) await installing
    else if (r.serviceWorker() && path === '/') claimed()
    else if (signingIn && r.isNavigationRequest() && path === '/') {
      signingIn = false
      install()
      await claim
    }
    await route.continue()
  })
  const page = await app.firstWindow()
  await expect(page).toHaveURL(/\/sign-in/, {timeout: 30_000})
  signingIn = true
  await signIn(page)
  await expect.poll(() => kept(page), {timeout: 20_000}).toBe(true)
  await app.close()
})
