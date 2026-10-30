import {expect, test, type APIRequestContext} from '@playwright/test'

const MISSING = ['/assets/missing-0000.js', '/assets/deep/missing-0000.css']

const answer = async (request: APIRequestContext, path: string, method: 'get' | 'head' = 'get') => {
  const res = await request[method](path, {maxRedirects: 0})
  const body = method === 'get' && res.status() === 404 ? JSON.stringify((await res.text()).slice(0, 40)) : undefined
  return [path, res.status(), res.headers()['content-type']?.split(';')[0], res.headers()['location'], body].filter(Boolean).join(' ')
}

test('P3f: a missing /assets file answers a bare 404 signed in and signed out; a page signed out still sends you to sign in', async ({page, playwright, baseURL}) => {
  const out = await playwright.request.newContext({baseURL, storageState: {cookies: [], origins: []}})
  const html = await (await out.get('/sign-in?redirect=%2F')).text()
  const real = html.match(/\/assets\/[\w.-]+\.js/)?.[0]
  expect(real, 'the sign-in page loads a built script').toBeTruthy()

  const bare = MISSING.map((p) => `${p} 404 text/plain "not found"`)
  expect(await Promise.all([real!, ...MISSING, '/', '/no-such-page'].map((p) => answer(out, p)))).toEqual([
    `${real} 200 text/javascript`,
    ...bare,
    '/ 307 /sign-in?redirect=%2F',
    '/no-such-page 307 /sign-in?redirect=%2Fno-such-page',
  ])
  expect(await Promise.all(MISSING.map((p) => answer(out, p, 'head')))).toEqual(MISSING.map((p) => `${p} 404 text/plain`))
  expect(await Promise.all([real!, ...MISSING].map((p) => answer(page.request, p)))).toEqual([`${real} 200 text/javascript`, ...bare])
  await out.dispose()
})

test('P3f: the editor files answer signed out, so the service worker can precache them before sign-in', async ({playwright, baseURL}) => {
  const out = await playwright.request.newContext({baseURL, storageState: {cookies: [], origins: []}})
  const files = await out.get('/editor-files', {maxRedirects: 0})
  expect(`${files.status()} ${files.headers()['content-type']}`).toBe('200 application/json')
  const {script, styles} = (await files.json()) as {script: string; styles: string[]}
  expect(await Promise.all([script, ...styles].map((p) => answer(out, p)))).toEqual([`${script} 200 text/javascript`, ...styles.map((p) => `${p} 200 text/css`)])
  await out.dispose()
})
