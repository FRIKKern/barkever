import {spawn} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const GRACE_MS = 2000

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

const [cmd, ...args] = process.argv.slice(2)
if (!cmd) {
  console.error('usage: node scripts/own-tmp.mjs <command> [args...]')
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
child.on('exit', (code) => done(code ?? 1))
