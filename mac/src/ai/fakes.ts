import {chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
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

export type FakeCall = {cli: string; pid: number; cwd: string; env: string[]; home: string; codexHome?: string; links?: string[]; args: string[]; system: string; prompt: string}
export type Behavior = 'answer' | 'fail' | 'hang' | 'quiet' | 'limit' | 'no-turn' | {reply: unknown}

export function ownerHome() {
  const home = mkdtempSync(join(tmpdir(), 'barkever-owner-home-'))
  for (const door of DOORS) {
    mkdirSync(dirname(join(home, door)), {recursive: true})
    writeFileSync(join(home, door), `SYNTHETIC-MARKER ${door}`)
  }
  writeFileSync(join(home, '.codex', 'auth.json'), '{"auth_mode":"synthetic"}')
  return home
}

export function fakeBin(behavior: Partial<Record<'claude' | 'codex', Behavior>> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'barkever-fake-bin-'))
  for (const f of readdirSync(FAKES)) copyFileSync(join(FAKES, f), join(dir, f))
  for (const f of ['claude', 'codex']) chmodSync(join(dir, f), 0o755)
  const behave = (b: typeof behavior) => writeFileSync(join(dir, 'behavior.json'), JSON.stringify(b))
  behave(behavior)
  const read = (file: string) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8').trim().split('\n') : [])
  const calls = (): FakeCall[] => read('calls.jsonl').map((l) => JSON.parse(l))
  const termed = () => read('sigterm').map(Number)
  const trapped = (): Record<string, number> => Object.fromEntries(read('trapped').map((l) => l.split(' ')).map(([cli, pid]) => [cli, Number(pid)]))
  return {dir, home: ownerHome(), behave, calls, termed, trapped}
}
