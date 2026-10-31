import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const made: string[] = []

export function profile() {
  const dir = mkdtempSync(join(tmpdir(), 'barkever-mac-e2e-'))
  made.push(dir)
  return dir
}

export function dropProfiles() {
  for (const dir of made.splice(0)) rmSync(dir, {recursive: true, force: true, maxRetries: 5})
}
