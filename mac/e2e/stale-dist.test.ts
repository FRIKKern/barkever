import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {staleDist} from './stale-dist.ts'

function app(t: {after: (f: () => void) => void}) {
  const dir = mkdtempSync(join(tmpdir(), 'barkever-stale-dist-'))
  t.after(() => rmSync(dir, {recursive: true, force: true}))
  mkdirSync(join(dir, 'src/ui'), {recursive: true})
  const put = (file: string, at: number) => {
    writeFileSync(join(dir, file), '')
    utimesSync(join(dir, file), at, at)
  }
  return {dir, put}
}

test('no build: says to run pnpm e2e', (t) => {
  const {dir, put} = app(t)
  put('src/ui/a.ts', 100)
  assert.equal(staleDist(dir), 'app/dist is missing: run pnpm e2e (builds first)')
})

test('a build newer than every source file is fresh, and one source file newer anywhere makes it stale', (t) => {
  const {dir, put} = app(t)
  mkdirSync(join(dir, 'dist/server'), {recursive: true})
  put('dist/server/server.js', 200)
  put('src/top.ts', 100)
  put('src/ui/a.ts', 200)
  assert.equal(staleDist(dir), null)
  put('src/ui/a.ts', 201)
  assert.equal(staleDist(dir), `app/dist is older than ${join(dir, 'src/ui/a.ts')}: run pnpm e2e (builds first)`)
})
