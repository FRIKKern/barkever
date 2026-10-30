import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {seal} from '../src/server/seal.ts'
import {leaks, secretNeedles} from './needles.ts'

const FAKE_TOKEN = `bppat_${'A'.repeat(43)}`
const SHAPED_COOKIE =
  'v1.5Coxbx3g3B09QfTj.bpw_lPowHVlEuOIhCynRWp9Bea9kTZiwy9ovRm0xLQ5Pl4v72ydS-ZWgEyludOt5M-gVf_WpVb-xBZvyoWoWWm6JHABSEzQes666Y6W7XhAXuNFhaAUdhzLuzmzZ4C376Uv5k8LPBOtBaEs3mw.UMqYamsiWps4xHzePUPaPA'
const setCookie = (value: string) => `{"set-cookie":"bk_session=${value}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax"}`

test('a value under 16 characters never becomes a needle, so a flag like 1 cannot turn every surface red', () => {
  const secret = randomBytes(24).toString('base64url')
  const env = {A_SECRET: secret, B_TOKEN: '1', C_TOKEN: '', D_KEY: 'x'.repeat(15), E_PASSWORD: 'y'.repeat(16)}
  const needles = secretNeedles(['A_SECRET', 'B_TOKEN', 'C_TOKEN', 'D_KEY', 'E_PASSWORD', 'F_SECRET'], env)
  assert.deepEqual(needles.map(({name, value}) => `${name} ${value.length}`), ['A_SECRET 32', 'E_PASSWORD 16'])
  assert.deepEqual(leaks(needles, 'page', `step 1 of 1, then ${secret}`), ['page: A_SECRET'])
})

test('the shape scan skips the session cookie it is told about, and still sees a token beside it', () => {
  assert.deepEqual(leaks([], 'sign-in headers', setCookie(SHAPED_COOKIE)), ['sign-in headers: a bp token shape'])
  assert.deepEqual(leaks([], 'sign-in headers', setCookie(SHAPED_COOKIE), [SHAPED_COOKIE]), [])
  assert.deepEqual(leaks([], 'sign-in headers', setCookie(`${SHAPED_COOKIE}${FAKE_TOKEN}`), [SHAPED_COOKIE]), ['sign-in headers: a bp token shape'])
  assert.deepEqual(leaks([], 'page', `bpx${SHAPED_COOKIE}_${'B'.repeat(43)}`, [SHAPED_COOKIE]), [])
  assert.deepEqual(leaks([], 'page', FAKE_TOKEN, ['']), ['page: a bp token shape'])
  assert.deepEqual(leaks([{name: 'session token', value: FAKE_TOKEN}], 'page', FAKE_TOKEN, [FAKE_TOKEN]), ['page: session token'])
})

test('10 000 sealed session cookies: the shape scan never hits the cookie the server set', (t) => {
  const secret = randomBytes(32).toString('base64url')
  const cookies = Array.from({length: 10_000}, () =>
    seal({email: 'fx-e2e@example.test', token: `bpsess_${randomBytes(32).toString('base64url')}`, exp: 1893456000}, secret),
  )
  const raw = cookies.filter((c) => leaks([], 'h', setCookie(c)).length).length
  t.diagnostic(`${raw} of 10000 cookies match the bp token shape on their own`)
  assert.deepEqual(cookies.filter((c) => leaks([], 'h', setCookie(c), [c]).length), [])
})
