import {strict as assert} from 'node:assert'
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {installPort, savedPort} from './port.ts'
import {serverEnv} from './server-env.ts'
import {memoryOnly} from './session-cookie.ts'
import {mergePath, pathFromShell} from './shell-path.ts'
import {openVault, type Box} from './vault.ts'

const dir = () => mkdtempSync(join(tmpdir(), 'barkever-mac-test-'))
const box: Box = {encryptString: (s) => Buffer.from(s, 'utf8').reverse(), decryptString: (b) => Buffer.from(b).reverse().toString('utf8')}

test('a sign-in cookie loses its lifetime so it never reaches disk; other cookies pass', () => {
  const kept = memoryOnly('bk_session=v1.abc.def.ghi; Max-Age=2592000; Path=/; Expires=Fri, 27 Nov 2026 04:00:00 GMT; HttpOnly; Secure; SameSite=Lax')
  assert.deepEqual(kept, {header: 'bk_session=v1.abc.def.ghi; Path=/; HttpOnly; Secure; SameSite=Lax', session: 'v1.abc.def.ghi'})
  assert.equal(memoryOnly('theme=dark; Max-Age=60'), undefined)
})

test('a deleting cookie stays as sent and clears the kept session', () => {
  for (const h of ['bk_session=; Max-Age=0; Path=/', 'bk_session=x; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'bk_session=x; max-age=-1'])
    assert.deepEqual(memoryOnly(h), {header: h, session: null})
})

test('the vault makes one secret, keeps it across opens, and holds or drops the session', () => {
  const file = join(dir(), 'vault.bin')
  const first = openVault(file, box)
  assert.ok(first.secret.length >= 32)
  first.keep('sealed-cookie')
  assert.ok(!readFileSync(file, 'utf8').includes('sealed-cookie'))
  const again = openVault(file, box)
  assert.equal(again.secret, first.secret)
  assert.equal(again.session(), 'sealed-cookie')
  again.keep(null)
  assert.equal(openVault(file, box).session(), undefined)
})

test('a vault the keychain can no longer open starts over signed out', () => {
  const file = join(dir(), 'vault.bin')
  writeFileSync(file, 'not sealed')
  const v = openVault(file, box)
  assert.ok(v.secret.length >= 32)
  assert.equal(v.session(), undefined)
})

test('the port is picked once per install and reused after', async () => {
  const file = join(dir(), 'port')
  const port = await installPort(file)
  assert.equal(await installPort(file), port)
  assert.equal(savedPort(file), port)
  writeFileSync(file, 'nonsense')
  assert.equal(savedPort(file), undefined)
})

test('the login shell PATH is read after the marker and merged without repeats', () => {
  assert.equal(pathFromShell('motd banner\n__BARKEVER_PATH__\n/opt/homebrew/bin:/usr/bin\n'), '/opt/homebrew/bin:/usr/bin')
  assert.equal(pathFromShell('no marker printed'), undefined)
  assert.equal(mergePath('/a:/b', undefined, '/b:/c'), '/a:/b:/c')
})

test('the server gets Barkpark defaults, the secret and no tokens', () => {
  const env = serverEnv({BARKPARK_TOKEN: 't', BARKPARK_DATASET: 'fixtures', ANTHROPIC_API_KEY: 'k', HOME: '/Users/x'}, 's'.repeat(43), '/usr/bin')
  assert.deepEqual(env, {NODE_ENV: 'production', PATH: '/usr/bin', BARKPARK_URL: 'https://guerrilla.barkpark.cloud', BARKEVER_SESSION_SECRET: 's'.repeat(43), BARKPARK_DATASET: 'fixtures', HOME: '/Users/x'})
})
