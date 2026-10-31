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

export async function dropProfilesAfter(quit: () => Promise<void>, waitMs = 15_000) {
  let timer: NodeJS.Timeout | undefined
  try {
    await Promise.race([quit(), new Promise((done) => (timer = setTimeout(done, waitMs)))])
  } finally {
    clearTimeout(timer)
    dropProfiles()
  }
}
