import {test} from 'node:test'
import assert from 'node:assert/strict'
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {dropProfiles, profile} from './profiles.ts'

test('every profile dir is gone after the cleanup, with what the app wrote into it', () => {
  const dirs = [profile(), profile()]
  mkdirSync(join(dirs[0]!, 'Local Storage', 'leveldb'), {recursive: true})
  writeFileSync(join(dirs[0]!, 'Local Storage', 'leveldb', '000003.log'), 'e2e@example.test')
  writeFileSync(join(dirs[1]!, 'vault.bin'), 'synthetic')
  dropProfiles()
  assert.deepEqual(dirs.filter((d) => existsSync(d)), [])
})

test('a dir the test already removed is fine, and a second cleanup is a no-op', () => {
  const removed = profile()
  rmSync(removed, {recursive: true})
  const kept = profile()
  dropProfiles()
  dropProfiles()
  assert.equal(existsSync(kept), false)
})
