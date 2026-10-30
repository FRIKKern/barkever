import {chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const FAKES = fileURLToPath(new URL('../../test/fake', import.meta.url))

export type FakeCall = {cli: string; cwd: string; env: string[]; args: string[]; system: string; prompt: string; userInstructions?: string}
export type Behavior = 'answer' | 'fail' | 'hang' | 'quiet' | 'limit' | 'no-turn' | {reply: unknown}

export function fakeBin(behavior: Partial<Record<'claude' | 'codex', Behavior>> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'barkever-fake-bin-'))
  for (const f of readdirSync(FAKES)) copyFileSync(join(FAKES, f), join(dir, f))
  for (const f of ['claude', 'codex']) chmodSync(join(dir, f), 0o755)
  const behave = (b: typeof behavior) => writeFileSync(join(dir, 'behavior.json'), JSON.stringify(b))
  behave(behavior)
  const log = join(dir, 'calls.jsonl')
  const calls = (): FakeCall[] => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [])
  return {dir, behave, calls}
}
