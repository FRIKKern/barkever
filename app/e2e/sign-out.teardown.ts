import {expect, test} from '@playwright/test'

test('end the kept session at Barkpark', async ({request}) => {
  const res = await request.post('/sign-out', {maxRedirects: 0})
  expect(res.status()).toBe(303)
})
