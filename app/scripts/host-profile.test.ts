import assert from 'node:assert/strict'
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import test from 'node:test'
import {fileURLToPath} from 'node:url'
import {focusCanvas} from '../src/lib/canvas-focus.ts'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const checker = path.join(repo, 'host-profile/check.mjs')
const profilePath = path.join(repo, 'host-profile/barkever.json')
const run = (profile: string) => spawnSync(process.execPath, [checker, profile], {encoding: 'utf8'})

test('Barkever host profile matches the pinned editor surface', () => {
  const result = run(profilePath)
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
test('canvas focus uses the public seam and preserves the supported 1.20 fallback', () => {
  const calls: string[] = []
  focusCanvas({focusSelection: () => (calls.push('public'), true), querySelector: () => ({focus: () => calls.push('legacy')})})
  focusCanvas({querySelector: (selector) => (assert.equal(selector, '.ProseMirror'), {focus: () => calls.push('legacy')})})
  assert.deepEqual(calls, ['public', 'legacy'])
})

test('Barkever host profile rejects an undeclared member', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'barkever-host-profile-'))
  try {
    const profile = JSON.parse(readFileSync(profilePath, 'utf8')) as {root: string; uses: Record<string, Record<string, string[]>>}
    profile.root = repo
    for (const uses of Object.values(profile.uses)) {
      for (const [kind, names] of Object.entries(uses)) {
        if (kind === 'member') uses[kind] = names.filter((name) => name !== 'focusSelection')
      }
    }
    const altered = path.join(dir, 'barkever.json')
    writeFileSync(altered, JSON.stringify(profile))
    const result = run(altered)
    assert.equal(result.status, 1)
    assert.match(result.stdout, /undeclared .* focusSelection/)
  } finally {
    rmSync(dir, {recursive: true, force: true})
  }
})

