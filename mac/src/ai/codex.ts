import {spawn} from 'node:child_process'
import {mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {Provider} from './provider.ts'

const OFF = ['shell_tool', 'unified_exec', 'apps', 'plugins', 'browser_use', 'computer_use', 'image_generation', 'multi_agent', 'hooks', 'view_image', 'skill_search', 'tool_suggest', 'goals', 'sleep_tool']

export const GRACE_MS = 2000

type Event = {type: string; usage?: {input_tokens: number; output_tokens: number}; error?: {message: string}}

export const codexArgs = (system: string) => [
  'exec',
  '--json',
  '--output-schema',
  'schema.json',
  '--output-last-message',
  'answer.json',
  '--sandbox',
  'read-only',
  '--skip-git-repo-check',
  '--ephemeral',
  '--ignore-user-config',
  '--ignore-rules',
  '-c',
  'web_search="disabled"',
  '-c',
  'approval_policy="never"',
  '-c',
  `developer_instructions=${JSON.stringify(system)}`,
  ...OFF.flatMap((f) => ['--disable', f]),
  '-',
]

function freshHome(owner: Record<string, string>) {
  const home = mkdtempSync(join(tmpdir(), 'barkever-codex-home-'))
  const codexHome = join(home, '.codex')
  mkdirSync(codexHome)
  symlinkSync(join(owner.CODEX_HOME ?? join(owner.HOME, '.codex'), 'auth.json'), join(codexHome, 'auth.json'))
  return {home, env: {...owner, HOME: home, CODEX_HOME: codexHome}}
}

function run(bin: string, args: string[], cwd: string, owner: Record<string, string>, timeout: number, input: string) {
  const {home, env} = freshHome(owner)
  return new Promise<{out: string; err: string; code: number | null}>((done, fail) => {
    const child = spawn(bin, args, {cwd, env})
    const late = setTimeout(() => {
      fail(new Error(`codex gave no answer in ${timeout / 1000} s`))
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), GRACE_MS).unref()
    }, timeout)
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.once('error', fail)
    child.once('close', (code) => {
      clearTimeout(late)
      rmSync(home, {recursive: true, force: true})
      done({out, err, code})
    })
    child.stdin.end(input)
  })
}

export const codex = (bin: string): Provider => ({
  name: 'codex',
  async run({system, prompt, schema, cwd, env, timeoutMs}) {
    writeFileSync(join(cwd, 'schema.json'), JSON.stringify(schema))
    const {out, err, code} = await run(bin, codexArgs(system), cwd, env, timeoutMs, prompt)
    const events = out.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Event)
    if (code !== 0) throw new Error(events.find((e) => e.type === 'turn.failed')?.error?.message ?? `codex exited with ${code}: ${err.trim()}`)
    const done = events.find((e) => e.type === 'turn.completed')
    if (!done) throw new Error('codex stopped before the turn completed')
    const usage = done.usage!
    return {data: JSON.parse(readFileSync(join(cwd, 'answer.json'), 'utf8')), model: 'codex', tokens: usage.input_tokens + usage.output_tokens, costUsd: null}
  },
})
