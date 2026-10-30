import {expect, test, type APIRequestContext} from '@playwright/test'

const MISSING = ['/assets/missing-0000.js', '/assets/deep/missing-0000.css']

const answer = async (request: APIRequestContext, path: string) => {
  const res = await request.get(path, {maxRedirects: 0})
  return [path, res.status(), res.headers()['content-type']?.split(';')[0], res.headers()['location']].filter(Boolean).join(' ')
}

test('P3f: a missing /assets file answers 404 signed in and signed out; a page signed out still sends you to sign in', async ({page, playwright, baseURL}) => {
  const out = await playwright.request.newContext({baseURL, storageState: {cookies: [], origins: []}})
  const html = await (await out.get('/sign-in?redirect=%2F')).text()
  const real = html.match(/\/assets\/[\w.-]+\.js/)?.[0]
  expect(real, 'the sign-in page loads a built script').toBeTruthy()

  expect(await Promise.all([real!, ...MISSING, '/', '/no-such-page'].map((p) => answer(out, p)))).toEqual([
    `${real} 200 text/javascript`,
    ...MISSING.map((p) => `${p} 404 text/html`),
    '/ 307 /sign-in?redirect=%2F',
    '/no-such-page 307 /sign-in?redirect=%2Fno-such-page',
  ])
  expect(await Promise.all([real!, ...MISSING].map((p) => answer(page.request, p)))).toEqual([`${real} 200 text/javascript`, ...MISSING.map((p) => `${p} 404 text/html`)])
  await out.dispose()
})
