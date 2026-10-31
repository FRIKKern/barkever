import {expect, test, type BrowserContext, type Page} from '@playwright/test'
import {ACCOUNT, cli, sessionToken} from './account'
import {prefIds as ids} from './fixtures-cleanup'
import {capture, servedFiles, serverSecrets} from './leaks'
import {exactLeaks, leaks, masked} from './needles'

const FAKE_TOKEN = `bpcanary_${'Z'.repeat(43)}`

const session = async (context: BrowserContext) => (await context.cookies()).find((c) => c.name === 'bk_session')

async function signIn(page: Page, password: string) {
  await page.getByLabel('Email').fill(ACCOUNT.email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', {name: 'Sign in'}).click()
}

test.describe('signed out', () => {
  test.use({storageState: {cookies: [], origins: []}})

  test('P3f: sign in lists your notes at the URL you wanted, no token reaches the page, sign out ends the session', async ({page, context, browser, baseURL}) => {
    const {trace, screenshot, video} = test.info().project.use
    expect({trace, screenshot, video, pageSnapshot: process.env.PLAYWRIGHT_NO_COPY_PROMPT}, 'a failing run writes no trace, image or page snapshot').toEqual({trace: 'off', screenshot: 'off', video: 'off', pageSnapshot: '1'})
    const received = await capture(page, async () => (await session(context))?.value)

    await page.goto('/?n=fx-note-01')
    await expect(page).toHaveURL(/\/sign-in\?redirect=%2F%3Fn%3Dfx-note-01$/)
    expect((await (await page.request.get('/?n=fx-note-01')).text()).includes('Harbor redesign')).toBe(false)

    await signIn(page, 'not-the-password')
    await expect(page.getByRole('alert')).toHaveText('That email and password don’t match.')
    await expect(page.getByLabel('Password')).toHaveValue('')
    await expect(page).toHaveURL(/\/sign-in/)

    await signIn(page, ACCOUNT.password)
    await expect(page).toHaveURL(/\/\?n=fx-note-01$/)
    await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: sitemap')
    expect(await page.getByTestId('note-row').count()).toBeGreaterThanOrEqual(50)
    const unreadableStream = `/es-canary-${FAKE_TOKEN}`
    await page.route(`**${unreadableStream}`, (r) => r.fulfill({status: 200, headers: {'content-type': 'text/event-stream'}, body: 'data: x\n\n'}))
    await page.evaluate((u) => fetch(u).then((r) => r.text()), unreadableStream)

    const cookie = await session(context)
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('Lax')
    const token = sessionToken(cookie!.value)
    expect(typeof token === 'string' && token.length > 0, 'the cookie unseals only with the server secret').toBe(true)
    const secrets = serverSecrets()
    const needles = [{name: 'session token', value: token!}, {name: 'bp CLI token', value: cli().token}, ...secrets.needles]
    expect(needles.map(({name}) => name)).toEqual(expect.arrayContaining(['BARKEVER_SESSION_SECRET', 'BARKPARK_TOKEN']))

    const pageCookie = await page.evaluate(() => document.cookie)
    expect(pageCookie.includes('bk_session')).toBe(false)
    const served = await servedFiles(page)
    expect(served.built).toBeGreaterThan(0)
    expect(served.files.filter(({want, status, type}) => !want || status !== 200 || !type.includes(want)).map(({p, status, type, want}) => masked(needles, `${p} ${status} ${type} (want ${want})`))).toEqual([])
    const {seen, unreadable, streams} = await received()
    expect(unreadable.map((u) => masked(needles, u))).toEqual([expect.stringMatching(/^200 \/es-canary-<bp token shape> stream: the stream ended after \d+ characters without a welcome$/)])
    const scan = (where: string, text: string) => leaks(needles, where, text, [cookie!.value])
    const hits = [
      ...exactLeaks(needles, 'cookie value', cookie!.value),
      ...scan('document.cookie', pageCookie),
      ...scan('rendered page', await page.content()),
      ...scan('server-rendered html', await (await page.request.get('/?n=fx-note-01')).text()),
      ...served.files.flatMap(({p, text}) => scan(p, text)),
      ...seen.flatMap(({where, text}) => scan(where, text)),
    ]
    expect(hits).toEqual([])
    console.log(
      `P3f: searched ${served.files.length} served files (${served.built} built, ${served.editor} editor), ${seen.length} responses and headers, ${streams} event stream(s) up to welcome, the page and document.cookie for ${needles.length} secrets (${needles.map(({name}) => name).join(', ')}) and the bp token shape: 0 hits; under 16 characters, not searched: ${secrets.short.join(', ') || 'none'}`,
    )

    await page.getByTestId('sign-out').click()
    await expect(page).toHaveURL(/\/sign-in/)
    expect(await session(context)).toBeUndefined()
    await page.goto('/')
    await expect(page).toHaveURL(/\/sign-in\?redirect=%2F$/)

    const copy = await browser.newContext({baseURL})
    await copy.addCookies([cookie!])
    const other = await copy.newPage()
    await other.goto('/')
    await expect(other).toHaveURL(/\/sign-in/)
    await copy.close()
  })
})

test('P3f: prefs read and write as the signed-in user, not as the CLI token', async ({page, context}) => {
  const token = sessionToken((await session(context))!.value)!
  const owner = cli().token
  const ownerPrefs = () => Promise.all([ids(owner, 'shortcuts'), ids(owner, 'recents')])
  const ownerBefore = await ownerPrefs()

  await page.goto('/?n=fx-note-03')
  await expect(page.getByTestId('title')).toHaveValue('Harbor redesign: content plan')
  const star = page.getByTestId('star')
  const was = (await star.getAttribute('aria-pressed')) === 'true'
  expect((await ids(token, 'shortcuts')).includes('fx-note-03')).toBe(was)

  await star.click()
  await expect.poll(async () => (await ids(token, 'shortcuts')).includes('fx-note-03')).toBe(!was)
  await expect.poll(async () => (await ids(token, 'recents'))[0]).toBe('fx-note-03')
  expect(await ownerPrefs()).toEqual(ownerBefore)

  await star.click()
  await expect.poll(async () => (await ids(token, 'shortcuts')).includes('fx-note-03')).toBe(was)
})
