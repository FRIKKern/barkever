import {strict as assert} from 'node:assert'
import {spawn, spawnSync} from 'node:child_process'
import {mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, test} from 'node:test'

const FIXTURE = new URL('../test/hanging-fakes.ts', import.meta.url).pathname
const root = mkdtempSync(join(tmpdir(), 'barkever-orphans-'))
const alive = () => spawnSync('ps', ['-Ao', 'pid=,command='], {encoding: 'utf8'}).stdout.split('\n').filter((l) => l.includes(root)).map((l) => Number(l.trim().split(' ')[0]))
const trapped = () => readdirSync(root).filter((d) => d.startsWith('barkever-fake-bin-')).flatMap((d) => readFileSync(join(root, d, 'trapped'), {encoding: 'utf8', flag: 'a+'}).split('\n').filter(Boolean))
const until = async (ok: () => boolean, ms: number) => {
  for (const end = Date.now() + ms; !ok() && Date.now() < end; ) await new Promise((r) => setTimeout(r, 100))
}
after(() => {
  for (const pid of alive()) process.kill(pid, 'SIGKILL')
  rmSync(root, {recursive: true, force: true})
})

test('fake claude and codex that hang die with their test, whether it fails, times out or passes, and with their run when it is killed', {timeout: 60_000}, async () => {
  const {NODE_TEST_CONTEXT, ...env} = process.env
  const run = spawn('node', ['--test', '--experimental-strip-types', FIXTURE], {env: {...env, TMPDIR: `${root}/`}, stdio: ['ignore', 'pipe', 'ignore']})
  let out = ''
  run.stdout.on('data', (d) => (out += d))
  const exited = new Promise((done) => run.on('exit', done))
  await until(() => trapped().length === 8, 30_000)
  assert.match(out, /not ok 1 - fails while its fakes hang[\s\S]*not ok 2 - times out[\s\S]*ok 3 - passes before/)
  await until(() => alive().length <= 2, 1000)
  assert.equal(alive().length, 2, 'only the running test keeps its two fakes')
  run.kill('SIGTERM')
  await exited
  await until(() => alive().length === 0, 3000)
  assert.deepEqual(alive(), [], 'no fake outlives a killed run')
})
