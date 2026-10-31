import {spawn} from 'node:child_process'
import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const [cmd, ...args] = process.argv.slice(2)
const root = mkdtempSync(join(tmpdir(), 'barkever-run-'))
const child = spawn(cmd, args, {stdio: 'inherit', env: {...process.env, TMPDIR: `${root}/`}})
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal))
child.on('exit', (code) => {
  rmSync(root, {recursive: true, force: true, maxRetries: 5})
  process.exit(code ?? 1)
})
