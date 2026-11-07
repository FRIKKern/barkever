import {expect, test, type Page} from '@playwright/test'
import {ACCOUNT} from './account'

const replicas = (page: Page) =>
  page.evaluate(async () => ({
    dbs: (await indexedDB.databases()).map((d) => d.name ?? '').filter((n) => n.startsWith('barkever')),
    journals: Object.keys(localStorage).filter((k) => k.endsWith('-journal')),
    owner: localStorage.getItem('barkever-owner') !== null,
    shell: !!(await caches.match('/')),
  }))

test.use({storageState: {cookies: [], origins: []}})

test('sign out drops this device’s copy of the notes, its owner and its offline shell; the next sign-in starts from Barkpark', async ({page}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.getByLabel('Email').fill(ACCOUNT.email)
  await page.getByLabel('Password').fill(ACCOUNT.password)
  await page.getByRole('button', {name: 'Sign in'}).click()
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 20_000})

  await expect.poll(async () => (await replicas(page)).shell, {timeout: 20_000}).toBe(true)
  const signedIn = await replicas(page)
  expect(signedIn.owner).toBe(true)
  expect(signedIn.dbs).toHaveLength(1)
  expect(signedIn.dbs[0]).toMatch(/^barkever-[0-9a-f]{24}$/)
  const held = await page.evaluate(
    (name) =>
      new Promise<number>((done) => {
        const r = indexedDB.open(name)
        r.onsuccess = () => {
          const q = r.result.transaction('notes').objectStore('notes').count()
          q.onsuccess = () => (r.result.close(), done(q.result))
        }
      }),
    signedIn.dbs[0],
  )
  expect(held).toBeGreaterThanOrEqual(50)

  await page.getByTestId('sign-out').click()
  await expect(page).toHaveURL(/\/sign-in/)
  await expect.poll(() => replicas(page)).toEqual({dbs: [], journals: [], owner: false, shell: false})
  expect(errors).toEqual([])
})

test('a device delete that never answers still signs out, with the owner and journal forgotten', async ({page}) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.deleteDatabase = () => ({}) as IDBOpenDBRequest
  })
  await page.goto('/')
  await page.getByLabel('Email').fill(ACCOUNT.email)
  await page.getByLabel('Password').fill(ACCOUNT.password)
  await page.getByRole('button', {name: 'Sign in'}).click()
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 20_000})
  await page.getByTestId('sign-out').click()
  await expect(page).toHaveURL(/\/sign-in/, {timeout: 15_000})
  await expect.poll(() => replicas(page)).toMatchObject({journals: [], owner: false})
})
