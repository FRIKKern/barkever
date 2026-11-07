import {spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {after} from 'node:test'
import {fileURLToPath} from 'node:url'

const FAKES = fileURLToPath(new URL('../../test/fake', import.meta.url))

const DOORS = [
  '.claude/settings.json',
  '.claude/CLAUDE.md',
  '.claude/rules/marker.md',
  '.claude/skills/marker/SKILL.md',
  '.claude/agents/marker.md',
  '.claude.json',
  '.codex/config.toml',
  '.codex/AGENTS.md',
  '.codex/AGENTS.override.md',
  '.codex/rules/default.rules',
  '.codex/hooks.json',
  '.codex/skills/marker/SKILL.md',
  '.agents/skills/marker/SKILL.md',
  '.codex/memories/memory_summary.md',
  '.codex/agents/marker.toml',
]

type FakeCall = {cli: string; pid: number; cwd: string; env: string[]; home: string; codexHome?: string; links?: string[]; args: string[]; system: string; prompt: string}
type Behavior = 'answer' | 'fail' | 'hang' | 'quiet' | 'limit' | 'no-turn' | {reply: unknown} | {sign: string}

const UNIT = !!process.env.NODE_TEST_CONTEXT

export function testDir(prefix: string, gone: (dir: string) => void = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  if (UNIT)
    after(() => {
      gone(dir)
      rmSync(dir, {recursive: true, force: true, maxRetries: 5})
    })
  return dir
}

export function ownerHome() {
  const home = testDir('barkever-owner-home-')
  for (const door of DOORS) {
    mkdirSync(dirname(join(home, door)), {recursive: true})
    writeFileSync(join(home, door), `SYNTHETIC-MARKER ${door}`)
  }
  writeFileSync(join(home, '.codex', 'auth.json'), '{"auth_mode":"synthetic"}')
  return home
}

const kill = (pid: number) => {
  try {
    process.kill(pid, 'SIGKILL')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e
  }
}

const runningFrom = (dir: string) => spawnSync('ps', ['-Ao', 'pid=,command='], {encoding: 'utf8'}).stdout.split('\n').filter((l) => l.includes(dir)).map((l) => Number(l.trim().split(' ')[0]))

const reap = (dir: string) => runningFrom(dir).forEach(kill)

export const until = async (ok: () => boolean, ms: number) => {
  for (const end = Date.now() + ms; !ok() && Date.now() < end; ) await new Promise((r) => setTimeout(r, 50))
  return ok()
}

export const PARENT_WATCH = join(FAKES, 'parent-watch.cjs')

if (UNIT) createRequire(import.meta.url)(PARENT_WATCH)

export function fakeBin(behavior: Partial<Record<'claude' | 'codex', Behavior>> = {}) {
  const dir = testDir('barkever-fake-bin-', reap)
  for (const f of readdirSync(FAKES)) copyFileSync(join(FAKES, f), join(dir, f))
  for (const f of ['claude', 'codex']) chmodSync(join(dir, f), 0o755)
  const behave = (b: typeof behavior) => writeFileSync(join(dir, 'behavior.json'), JSON.stringify(b))
  behave(behavior)
  const read = (file: string) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8').trim().split('\n') : [])
  const calls = (): FakeCall[] => read('calls.jsonl').map((l) => JSON.parse(l))
  const termed = () => Object.fromEntries(read('sigterm').map((l) => l.split(' ').map(Number)))
  const trapped = (): Record<string, number> => Object.fromEntries(read('trapped').map((l) => l.split(' ')).map(([cli, pid]) => [cli, Number(pid)]))
  return {dir, home: ownerHome(), behave, calls, termed, trapped}
}
