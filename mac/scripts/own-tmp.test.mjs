import {strict as assert} from 'node:assert'
import {spawn} from 'node:child_process'
import {existsSync, readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {test} from 'node:test'

const OWN = new URL('./own-tmp.mjs', import.meta.url).pathname
const MAKE = `const {mkdtempSync, writeFileSync} = require('node:fs'); const {join} = require('node:path'); const d = mkdtempSync(join(require('node:os').tmpdir(), 'barkever-fake-bin-')); writeFileSync(join(d, 'calls.jsonl'), '{}'); console.log(d);`

function run(script, signal) {
  const child = spawn('node', [OWN, 'node', '-e', MAKE + script], {stdio: ['ignore', 'pipe', 'ignore']})
  let out = ''
  child.stdout.on('data', (d) => {
    out += d
    if (signal) child.kill(signal)
  })
  return new Promise((done) => child.on('exit', (code) => done({code, made: out.trim()})))
}

const runs = () => readdirSync(tmpdir()).filter((n) => n.startsWith('barkever-run-'))

test('a run that passes or fails keeps its exit code and leaves none of the dirs it made', async () => {
  const before = runs()
  for (const [script, want] of [['', 0], ['process.exit(3)', 3], ['throw new Error("planted")', 1]]) {
    const {code, made} = await run(script)
    assert.equal(code, want)
    assert.ok(made.startsWith(tmpdir()) && made !== tmpdir())
    assert.equal(existsSync(made), false)
  }
  assert.deepEqual(runs().filter((n) => !before.includes(n)), [])
})

test('a run stopped by a signal is stopped too, and still leaves nothing', async () => {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const {code, made} = await run('setInterval(() => {}, 1000)', signal)
    assert.notEqual(code, 0)
    assert.equal(existsSync(made), false)
  }
})
