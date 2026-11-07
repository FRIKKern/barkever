import {strict as assert} from 'node:assert'
import {spawn, spawnSync} from 'node:child_process'
import {once} from 'node:events'
import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {after, test} from 'node:test'

const OWN = new URL('./own-tmp.mjs', import.meta.url).pathname
const MAKE = `const {mkdtempSync, writeFileSync} = require('node:fs'); const {join} = require('node:path'); const d = mkdtempSync(join(require('node:os').tmpdir(), 'barkever-fake-bin-')); writeFileSync(join(d, 'calls.jsonl'), '{}'); console.log(process.pid + ' ' + d);`
const KID = `const kid = require('node:child_process').spawn('sleep', ['30.5'], {stdio: 'ignore'}); kid.unref(); console.log('kid ' + kid.pid);`
const HANG = 'setInterval(() => {}, 1000)'
const LIMIT = {timeout: 60_000}
const GROUP_GONE_MS = 3000
const temp = mkdtempSync(join(tmpdir(), 'barkever-own-tmp-test-'))
const clear = () => rmSync(temp, {recursive: true, force: true})
after(clear)

const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
const kill = (pid) => {
  try {
    process.kill(pid, 'SIGKILL')
  } catch {}
}
const living = new Set()
const cleanup = (t, kill) => {
  living.add(kill)
  t.after(() => {
    living.delete(kill)
    kill()
  })
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']) {
  process.on(signal, () => {
    for (const kill of living) kill()
    clear()
    process.exit(1)
  })
}

const gone = async (pid) => {
  for (let i = 0; i < 100 && alive(pid); i++) await wait(20)
  return !alive(pid)
}

function run(t, script, {signal, after, when = /\n/} = {}) {
  const own = spawn('node', [OWN, 'node', '-e', MAKE + script], {stdio: ['ignore', 'pipe', 'ignore']})
  let out = ''
  let sent
  const made = () => {
    const [pid, dir] = out.split('\n')[0].split(' ')
    return {pid: +pid || undefined, dir, kid: +(out.match(/^kid (\d+)$/m)?.[1] ?? 0) || undefined}
  }
  cleanup(t, () => {
    own.kill('SIGTERM')
    const {pid, kid} = made()
    for (const each of [-pid, pid, kid]) {
      try {
        process.kill(each, 'SIGKILL')
      } catch {}
    }
  })
  const send = () => {
    sent ??= Date.now()
    own.kill(signal)
  }
  if (after !== undefined) setTimeout(send, after)
  own.stdout.on('data', (d) => {
    out += d
    if (signal && after === undefined && when.test(out)) send()
  })
  return new Promise((done) => own.on('exit', (code) => done({code, took: Date.now() - sent, ...made()})))
}

const runs = () => readdirSync(tmpdir()).filter((n) => n.startsWith('barkever-run-'))

test('a run that passes or fails keeps its exit code and leaves none of the dirs it made', LIMIT, async (t) => {
  const before = runs()
  for (const [script, want] of [['', 0], ['process.exit(3)', 3], ['throw new Error("planted")', 1]]) {
    const {code, pid, dir} = await run(t, script)
    assert.equal(code, want)
    assert.ok(dir.startsWith(tmpdir()) && dir !== tmpdir())
    assert.equal(existsSync(dir), false)
    assert.ok(await gone(pid))
  }
  assert.deepEqual(runs().filter((n) => !before.includes(n)), [])
})

test('a run stopped by a signal is stopped too, and still leaves nothing', LIMIT, async (t) => {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']) {
    const {code, pid, dir} = await run(t, HANG, {signal})
    assert.notEqual(code, 0, signal)
    assert.equal(existsSync(dir), false, signal)
    assert.ok(await gone(pid), signal)
  }
})

test('a signal at any moment of start-up leaves no dir and no process', LIMIT, async (t) => {
  const before = runs()
  for (const after of [0, 1, 2, 5, 10, 20, 40, 80, 160]) {
    const {pid, dir} = await run(t, HANG, {signal: 'SIGTERM', after})
    if (dir) assert.equal(existsSync(dir), false, `${after} ms`)
    if (pid) assert.ok(await gone(pid), `${after} ms`)
  }
  assert.deepEqual(runs().filter((n) => !before.includes(n)), [])
})

test('a child that ignores the signal is killed after a grace period', LIMIT, async (t) => {
  const {code, took, pid, dir} = await run(t, `process.on('SIGTERM', () => {}); console.log('trapped'); ${HANG}`, {signal: 'SIGTERM', when: /^trapped$/m})
  assert.notEqual(code, 0)
  assert.ok(took >= 1900 && took < 5000, `took ${took} ms from the signal`)
  assert.equal(existsSync(dir), false)
  assert.ok(await gone(pid))
})

test("the child's own children are stopped too, when it exits and when it is signalled", LIMIT, async (t) => {
  for (const [script, signal] of [['', undefined], [HANG, 'SIGTERM']]) {
    const {kid} = await run(t, KID + script, {signal, when: /^kid /m})
    assert.ok(kid)
    assert.ok(await gone(kid), signal ?? 'exit')
  }
})

test('a run whose parent is killed stops its child and removes its dir', LIMIT, async (t) => {
  const parent = spawn('node', ['-e', `require('node:child_process').spawn('node', [${JSON.stringify(OWN)}, 'node', '-e', ${JSON.stringify(MAKE + HANG)}], {stdio: 'inherit'}); ${HANG}`], {stdio: ['ignore', 'pipe', 'ignore']})
  let out = ''
  parent.stdout.on('data', (d) => (out += d))
  cleanup(t, () => {
    parent.kill('SIGKILL')
    const pid = +out.split(' ')[0]
    for (const each of [-pid, pid]) {
      try {
        process.kill(each, 'SIGKILL')
      } catch {}
    }
  })
  while (!out.includes('\n')) await wait(20)
  const [pid, dir] = out.trim().split(' ')
  parent.kill('SIGKILL')
  assert.ok(await gone(+pid))
  for (let i = 0; i < 100 && existsSync(dir); i++) await wait(20)
  assert.equal(existsSync(dir), false)
})

test("the child's own children get the signal first, so they can clean up", LIMIT, async (t) => {
  const marker = join(mkdtempSync(join(temp, 'case-')), 'termed')
  const kid = `process.on('SIGTERM', () => { require('node:fs').writeFileSync(process.argv[1], 'termed'); process.exit(0) }); console.log('kid-ready'); ${HANG}`
  const script = `const kid = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(kid)}, ${JSON.stringify(marker)}], {stdio: ['ignore', 'inherit', 'ignore']}); process.on('SIGTERM', () => {}); kid.on('exit', () => process.exit(0));`
  await run(t, script, {signal: 'SIGTERM', when: /^kid-ready$/m})
  assert.equal(readFileSync(marker, 'utf8'), 'termed')
})

test('a signal that lands right after the spawn, before own-tmp runs another line, still leaves no dir and no process', LIMIT, async (t) => {
  const plant = join(mkdtempSync(join(temp, 'case-')), 'slow-spawn.cjs')
  writeFileSync(plant, "const cp = require('node:child_process'); const spawn = cp.spawn; cp.spawn = (...a) => { const c = spawn(...a); require('node:fs').writeSync(1, 'spawned\\n'); const until = Date.now() + 500; while (Date.now() < until); return c }; require('node:module').syncBuiltinESMExports()")
  const token = `own-tmp-race-${process.pid}-${Date.now()}`
  cleanup(t, () => spawnSync('pkill', ['-9', '-f', token]))
  const before = runs()
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']) {
    const own = spawn('node', ['--require', plant, OWN, 'node', '-e', `/*${token}*/ ${HANG}`], {stdio: ['ignore', 'pipe', 'ignore']})
    cleanup(t, () => own.kill('SIGTERM'))
    own.stdout.on('data', (d) => String(d).includes('spawned') && own.kill(signal))
    await once(own, 'exit')
  }
  for (let i = 0; i < 100 && spawnSync('pgrep', ['-f', token]).status === 0; i++) await wait(20)
  assert.notEqual(spawnSync('pgrep', ['-f', token]).status, 0, 'a child outlived own-tmp')
  assert.deepEqual(runs().filter((n) => !before.includes(n)), [])
})

for (const args of [[], ['']]) {
  test(`no command (${JSON.stringify(args)}) is a usage error that makes no dir`, LIMIT, () => {
    const empty = mkdtempSync(join(temp, 'case-'))
    const {status, stderr} = spawnSync('node', [OWN, ...args], {env: {...process.env, TMPDIR: `${empty}/`}, encoding: 'utf8', timeout: 10_000})
    assert.equal(status, 2)
    assert.match(stderr, /^usage: /)
    assert.deepEqual(readdirSync(empty), [])
  })
}

test('a TMPDIR that does not exist fails before anything runs', LIMIT, () => {
  const {status, stdout} = spawnSync('node', [OWN, 'node', '-e', 'require("node:fs").writeSync(1, "ran")'], {env: {...process.env, TMPDIR: join(temp, 'no-such-dir/')}, encoding: 'utf8', timeout: 10_000})
  assert.equal(status, 1)
  assert.equal(stdout, '')
})

test('a command that does not exist exits 127 with one line, and leaves no dir', LIMIT, () => {
  const empty = mkdtempSync(join(temp, 'case-'))
  const {status, stderr} = spawnSync('node', [OWN, 'no-such-binary-xyz'], {env: {...process.env, TMPDIR: `${empty}/`}, encoding: 'utf8', timeout: 10_000})
  assert.equal(status, 127)
  assert.equal(stderr, 'own-tmp: no-such-binary-xyz: spawn no-such-binary-xyz ENOENT\n')
  assert.deepEqual(readdirSync(empty), [])
})

test('a runner killed with SIGKILL leaves nothing in its process group', LIMIT, async (t) => {
  const dir = mkdtempSync(join(temp, 'runner-'))
  const pids = join(dir, 'pids')
  const file = join(dir, 'hangs.test.mjs')
  writeFileSync(file, `
    import {spawn} from 'node:child_process'
    import {writeFileSync} from 'node:fs'
    import {test} from 'node:test'
    test('hangs', () => {
      const kids = [spawn('sleep', ['30.7'], {stdio: 'ignore'}), spawn('node', ['-e', ${JSON.stringify(HANG)}], {stdio: 'ignore'})]
      writeFileSync(${JSON.stringify(pids)}, [process.ppid, process.pid, ...kids.map((k) => k.pid)].join(' '))
      return new Promise(() => {})
    })`)
  const {NODE_TEST_CONTEXT, ...outside} = process.env
  const own = spawn('node', [OWN, 'node', '--test', file], {stdio: 'ignore', env: outside})
  let runner
  cleanup(t, () => {
    own.kill('SIGKILL')
    if (runner) kill(-runner)
  })
  for (let i = 0; i < 1000 && !existsSync(pids); i++) await wait(20)
  const [leader, ...rest] = readFileSync(pids, 'utf8').split(' ').map(Number)
  runner = leader
  assert.equal(rest.length, 3)
  process.kill(runner, 'SIGKILL')
  for (const end = Date.now() + GROUP_GONE_MS; alive(-runner) && Date.now() < end; ) await wait(20)
  assert.equal(alive(-runner), false, `the group of ${runner} still runs ${GROUP_GONE_MS} ms after its runner died`)
  assert.deepEqual(rest.filter(alive), [])
})
