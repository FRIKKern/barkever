import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {seal} from '../src/server/seal.ts'
import {leaks, masked, secretNames, secretNeedles} from './needles.ts'

const FAKE_TOKEN = `bppat_${'A'.repeat(43)}`
const SHAPED_COOKIE =
  'v1.5Coxbx3g3B09QfTj.bpw_lPowHVlEuOIhCynRWp9Bea9kTZiwy9ovRm0xLQ5Pl4v72ydS-ZWgEyludOt5M-gVf_WpVb-xBZvyoWoWWm6JHABSEzQes666Y6W7XhAXuNFhaAUdhzLuzmzZ4C376Uv5k8LPBOtBaEs3mw.UMqYamsiWps4xHzePUPaPA'
const setCookie = (value: string) => `{"set-cookie":"bk_session=${value}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax"}`

test('every name ending in _TOKEN, _SECRET, _KEY or _PASSWORD is a secret name', () => {
  const source = 'process.env.D_PASSWORD ?? env.B_TOKEN; C_KEY, A_SECRET; BARKPARK_URL, X_TOKENS, y_KEY, KEY'
  assert.deepEqual(secretNames([source, 'B_TOKEN again']), ['A_SECRET', 'B_TOKEN', 'C_KEY', 'D_PASSWORD'])
})

test('a value under 16 characters never becomes a needle, whatever its suffix, and is named as skipped', () => {
  const secret = randomBytes(24).toString('base64url')
  const env = {A_SECRET: secret, B_TOKEN: 't'.repeat(20), C_KEY: 'k'.repeat(16), D_PASSWORD: 'p'.repeat(40), E_TOKEN: '1', F_KEY: 'f'.repeat(15), G_SECRET: '', H_PASSWORD: 'h'.repeat(15)}
  const {needles, short} = secretNeedles([...Object.keys(env), 'I_SECRET'], env)
  assert.deepEqual(needles.map(({name, value}) => `${name} ${value.length}`), ['A_SECRET 32', 'B_TOKEN 20', 'C_KEY 16', 'D_PASSWORD 40'])
  assert.deepEqual(short, ['E_TOKEN', 'F_KEY', 'H_PASSWORD'])
  assert.deepEqual(leaks(needles, 'page', `step 1 of 1, then ${secret}`), ['page: A_SECRET'])
})

test('the shape scan skips a known value of 16 or more characters, such as the session cookie, and still sees a token beside it', () => {
  assert.deepEqual(leaks([], 'sign-in headers', setCookie(SHAPED_COOKIE)), ['sign-in headers: a bp token shape'])
  assert.deepEqual(leaks([], 'sign-in headers', setCookie(SHAPED_COOKIE), [SHAPED_COOKIE]), [])
  assert.deepEqual(leaks([], 'sign-in headers', setCookie(`${SHAPED_COOKIE}${FAKE_TOKEN}`), [SHAPED_COOKIE]), ['sign-in headers: a bp token shape'])
  assert.deepEqual(leaks([], 'page', `bpx${SHAPED_COOKIE}_${'B'.repeat(43)}`, [SHAPED_COOKIE]), [])
  assert.deepEqual(leaks([], 'page', FAKE_TOKEN, ['', 'b', 'A'.repeat(15)]), ['page: a bp token shape'])
  assert.deepEqual(leaks([], 'page', FAKE_TOKEN, ['A'.repeat(16)]), [])
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

test('a needle or a bp token shape in a label is masked, so a failure never prints it', () => {
  const needles = [{name: 'A_SECRET', value: 'synthetic-secret-for-the-mask-0001'}]
  const path = `200 /assets/synthetic-secret-for-the-mask-0001/${FAKE_TOKEN}.js`
  const at = '200 /assets/<A_SECRET #73869e2c>/<bp token shape>.js'
  const labels = [...leaks(needles, path, `synthetic-secret-for-the-mask-0001 ${FAKE_TOKEN}`), masked(needles, `${path}: socket hang up at ${path}`)]
  assert.deepEqual(labels, [`${at}: A_SECRET`, `${at}: a bp token shape`, `${at}: socket hang up at ${at}`])
  assert.equal(masked([{name: 'bp CLI token', value: FAKE_TOKEN}], `GET /x/${FAKE_TOKEN}`), 'GET /x/<bp CLI token #c0439f2c>')
})
