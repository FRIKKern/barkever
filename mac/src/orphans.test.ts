import {strict as assert} from 'node:assert'
import {spawn, spawnSync} from 'node:child_process'
import {existsSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, test} from 'node:test'
import {PARENT_WATCH, fakeBin, until} from './ai/fakes.ts'

const FIXTURE = new URL('../test/hanging-fakes.ts', import.meta.url).pathname
const FAKES = new URL('./ai/fakes.ts', import.meta.url).pathname
const READY_MS = 30_000
const GONE_MS = 10_000
const root = mkdtempSync(join(tmpdir(), 'barkever-orphans-'))
const {NODE_TEST_CONTEXT, ...outside} = process.env
const ps = () => spawnSync('ps', ['-Ao', 'pid=,ppid=,command='], {encoding: 'utf8'}).stdout.split('\n').map((l) => l.trim().split(/\s+/)).filter((l) => l.length > 2)
const alive = (dir: string) => ps().filter(([, , ...cmd]) => cmd.join(' ').includes(dir)).map(([pid]) => Number(pid))
const orphaned = () => ps().filter(([, ppid, ...cmd]) => ppid === '1' && cmd.join(' ').includes(FIXTURE)).map(([pid]) => Number(pid))
const sleeper = spawn('node', ['--require', PARENT_WATCH, '-e', 'setInterval(() => {}, 1000)'], {stdio: 'ignore'})
sleeper.unref()
after(() => {
  for (const pid of [...alive(root), ...orphaned(), sleeper.pid!]) spawnSync('kill', ['-9', String(pid)])
  rmSync(root, {recursive: true, force: true})
})

for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
  test(`fake claude and codex that hang die with their test, whether it fails, times out or passes, and with their run when it gets ${signal}`, {timeout: 60_000}, async (t) => {
    const dir = mkdtempSync(join(root, `${signal}-`))
    const run = spawn('node', ['--require', PARENT_WATCH, '--test', '--experimental-strip-types', FIXTURE], {env: {...outside, TMPDIR: `${dir}/`}, stdio: ['ignore', 'pipe', 'ignore']})
    t.after(() => run.kill('SIGKILL'))
    let out = ''
    run.stdout.on('data', (d) => (out += d))
    const exited = new Promise((done) => run.on('exit', done))
    await until(() => out.includes('still running, fakes trapped'), READY_MS)
    assert.match(out, /\nnot ok 1 - fails while its fakes hang\n[\s\S]*\nnot ok 2 - times out[\s\S]*\nok 3 - passes before/)
    await until(() => alive(dir).length <= 2, GONE_MS)
    assert.equal(alive(dir).length, 2, 'only the running test keeps its two fakes')
    run.kill(signal)
    await exited
    await until(() => alive(dir).length === 0, GONE_MS)
    assert.deepEqual(alive(dir), [], `no fake outlives a run that got ${signal}`)
  })
}

test('a test that made a fake-bin ends without touching a process that does not run from it', async () => {
  fakeBin()
})

test('the process left alone is still running', () => {
  assert.match(spawnSync('ps', ['-o', 'stat=', '-p', String(sleeper.pid)], {encoding: 'utf8'}).stdout, /^[^Z\s]/)
})

test('fakeBin outside node:test registers no hook, so a Playwright worker gets no test harness', () => {
  const run = spawnSync('node', ['--experimental-strip-types', '--input-type=module', '-e', `const {fakeBin} = await import(${JSON.stringify(FAKES)}); fakeBin(); console.log('made')`], {env: {...outside, TMPDIR: `${root}/`}, encoding: 'utf8'})
  assert.deepEqual([run.status, run.stdout.trim()], [0, 'made'])
})

test('a hang fake whose parent is gone before it loads still exits', async () => {
  const fake = fakeBin({codex: 'hang'})
  spawnSync('sh', ['-c', `node -e 'require(process.argv[1]).hangs("codex")' ${join(fake.dir, 'answer.cjs')} &`], {stdio: 'ignore'})
  assert.ok(await until(() => !!fake.trapped().codex, READY_MS), `the fake never loaded in ${READY_MS / 1000} s`)
  await until(() => alive(fake.dir).length === 0, GONE_MS)
  assert.deepEqual(alive(fake.dir), [])
})

test('a test file whose runner is gone before it loads fakes.ts still exits', async () => {
  const mark = join(root, 'late-loader')
  spawnSync('sh', ['-c', `NODE_TEST_CONTEXT=child node --experimental-strip-types -e 'import(process.argv[1]).then(() => require("node:fs").writeFileSync(process.argv[2], "")); setInterval(() => {}, 1000)' ${FAKES} ${mark} &`], {stdio: 'ignore', env: outside})
  assert.ok(await until(() => existsSync(mark), READY_MS), `the loader never loaded fakes.ts in ${READY_MS / 1000} s`)
  await until(() => alive(mark).length === 0, GONE_MS)
  assert.deepEqual(alive(mark), [])
})
