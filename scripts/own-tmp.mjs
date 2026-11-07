import {spawn} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const GRACE_MS = 2000
const DEADLINE_EXIT = 124

let child
const group = (signal) => {
  try {
    process.kill(-child.pid, signal)
  } catch {}
}
const stop = (signal) => {
  group(signal)
  setTimeout(() => group('SIGKILL'), GRACE_MS).unref()
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']) process.on(signal, () => stop(signal))
const parent = process.ppid
setInterval(() => process.ppid !== parent && stop('SIGHUP'), 500).unref()

const asked = process.argv[2]?.startsWith('--deadline') ? process.argv[2] : undefined
const deadline = asked && +asked.match(/^--deadline=([1-9]\d*)$/)?.[1]
const [cmd, ...args] = process.argv.slice(asked ? 3 : 2)
if (!cmd || (asked && !(deadline <= 2147483647))) {
  console.error('usage: node scripts/own-tmp.mjs [--deadline=<1 to 2147483647 ms>] <command> [args...]')
  process.exit(2)
}
const root = mkdtempSync(join(tmpdir(), 'barkever-run-'))
child = spawn(cmd, args, {stdio: 'inherit', detached: true, env: {...process.env, TMPDIR: `${root}/`}})
const done = (code) => {
  group('SIGKILL')
  rmSync(root, {recursive: true, force: true, maxRetries: 5})
  process.exit(code)
}
child.on('error', (error) => {
  console.error(`own-tmp: ${cmd}: ${error.message}`)
  done(127)
})
let late = false
if (deadline)
  setTimeout(() => {
    late = true
    console.error(`own-tmp: ${cmd} ran past its ${deadline} ms deadline; stopping it`)
    stop('SIGTERM')
  }, deadline)
child.on('exit', (code) => done(late ? DEADLINE_EXIT : code ?? 1))
