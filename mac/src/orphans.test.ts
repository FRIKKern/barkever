import {strict as assert} from 'node:assert'
import {spawn, spawnSync} from 'node:child_process'
import {appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, test} from 'node:test'
import {fakeBin} from './ai/fakes.ts'

const FIXTURE = new URL('../test/hanging-fakes.ts', import.meta.url).pathname
const FAKES = new URL('./ai/fakes.ts', import.meta.url).pathname
const root = mkdtempSync(join(tmpdir(), 'barkever-orphans-'))
const {NODE_TEST_CONTEXT, ...outside} = process.env
const ps = () => spawnSync('ps', ['-Ao', 'pid=,ppid=,command='], {encoding: 'utf8'}).stdout.split('\n').map((l) => l.trim().split(/\s+/)).filter((l) => l.length > 2)
const alive = (dir: string) => ps().filter(([, , ...cmd]) => cmd.join(' ').includes(dir)).map(([pid]) => Number(pid))
const orphaned = () => ps().filter(([, ppid, ...cmd]) => ppid === '1' && cmd.join(' ').includes(FIXTURE)).map(([pid]) => Number(pid))
const trapped = (dir: string) => readdirSync(dir).filter((d) => d.startsWith('barkever-fake-bin-')).flatMap((d) => readFileSync(join(dir, d, 'trapped'), {encoding: 'utf8', flag: 'a+'}).split('\n').filter(Boolean))
const until = async (ok: () => boolean, ms: number) => {
  for (const end = Date.now() + ms; !ok() && Date.now() < end; ) await new Promise((r) => setTimeout(r, 100))
}
const sleeper = spawn('node', ['-e', 'setInterval(() => {}, 1000)'], {detached: true, stdio: 'ignore'})
sleeper.unref()
after(() => {
  for (const pid of [...alive(root), ...orphaned(), sleeper.pid!]) spawnSync('kill', ['-9', String(pid)])
  rmSync(root, {recursive: true, force: true})
})

for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
  test(`fake claude and codex that hang die with their test, whether it fails, times out or passes, and with their run when it gets ${signal}`, {timeout: 60_000}, async () => {
    const dir = mkdtempSync(join(root, `${signal}-`))
    const run = spawn('node', ['--test', '--experimental-strip-types', FIXTURE], {env: {...outside, TMPDIR: `${dir}/`}, stdio: ['ignore', 'pipe', 'ignore']})
    let out = ''
    run.stdout.on('data', (d) => (out += d))
    const exited = new Promise((done) => run.on('exit', done))
    await until(() => trapped(dir).length === 8, 30_000)
    assert.match(out, /not ok 1 - fails while its fakes hang[\s\S]*not ok 2 - times out[\s\S]*ok 3 - passes before/)
    await until(() => alive(dir).length <= 2, 1000)
    assert.equal(alive(dir).length, 2, 'only the running test keeps its two fakes')
    run.kill(signal)
    await exited
    await until(() => alive(dir).length === 0, 3000)
    assert.deepEqual(alive(dir), [], `no fake outlives a run that got ${signal}`)
  })
}

test('a recorded pid that no longer runs from its fake-bin is left alone', async () => {
  appendFileSync(join(fakeBin().dir, 'pids'), `${sleeper.pid}\n`)
})

test('the pid left alone is still running', () => {
  assert.match(spawnSync('ps', ['-o', 'stat=', '-p', String(sleeper.pid)], {encoding: 'utf8'}).stdout, /^[^Z\s]/)
})

test('fakeBin outside node:test registers no hook, so a Playwright worker gets no test harness', () => {
  const run = spawnSync('node', ['--experimental-strip-types', '--input-type=module', '-e', `const {fakeBin} = await import(${JSON.stringify(FAKES)}); fakeBin(); console.log('made')`], {env: {...outside, TMPDIR: `${root}/`}, encoding: 'utf8'})
  assert.deepEqual([run.status, run.stdout.trim()], [0, 'made'])
})
