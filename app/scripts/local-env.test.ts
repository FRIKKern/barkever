import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fillFromBarkparkCli} from './local-env.ts'

// Fake values only: this test never touches the real ~/.config/barkpark.
const cfg = join(mkdtempSync(join(tmpdir(), 'bk-env-')), 'config.json')
writeFileSync(cfg, JSON.stringify({server: 'https://bp.example', token: 'fake-cli-token'}))

test('fills both from the CLI login when unset', () => {
  const env: NodeJS.ProcessEnv = {}
  fillFromBarkparkCli(env, cfg)
  assert.deepEqual(env, {BARKPARK_URL: 'https://bp.example', BARKPARK_TOKEN: 'fake-cli-token'})
})

test('never pairs the CLI token with another server', () => {
  const env: NodeJS.ProcessEnv = {BARKPARK_URL: 'https://other.example'}
  fillFromBarkparkCli(env, cfg)
  assert.equal(env.BARKPARK_TOKEN, undefined)
})

test('a token already set wins', () => {
  const env: NodeJS.ProcessEnv = {BARKPARK_TOKEN: 'from-env-local'}
  fillFromBarkparkCli(env, cfg)
  assert.equal(env.BARKPARK_TOKEN, 'from-env-local')
})

test('does nothing in CI or on Vercel', () => {
  for (const flag of ['CI', 'VERCEL']) {
    const env: NodeJS.ProcessEnv = {[flag]: '1'}
    fillFromBarkparkCli(env, cfg)
    assert.equal(env.BARKPARK_TOKEN, undefined)
  }
})
