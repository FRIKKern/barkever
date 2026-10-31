import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {claude} from '../src/ai/claude.ts'
import {codex} from '../src/ai/codex.ts'
import {fakeBin, until} from '../src/ai/fakes.ts'
import {childEnv} from '../src/ai/provider.ts'

const BOOT_MS = 800
const TRAP_MS = 20_000

function hung(timeoutMs = 60_000) {
  const fake = fakeBin({claude: 'hang', codex: 'hang'})
  const answer = join(fake.dir, 'answer.cjs')
  writeFileSync(answer, `for (const end = Date.now() + ${BOOT_MS}; Date.now() < end; );\n${readFileSync(answer, 'utf8')}`)
  const env = childEnv({...process.env, HOME: fake.home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: ''}, `${fake.dir}:${process.env.PATH}`)
  const call = {system: '', prompt: 'Question: x', schema: {}, env, timeoutMs}
  const runs = [claude(join(fake.dir, 'claude')), codex(join(fake.dir, 'codex'))].map((p) => p.run({...call, cwd: mkdtempSync(join(tmpdir(), 'barkever-ai-'))}).catch(() => {}))
  const trapped = async () => {
    if (!(await until(() => Object.keys(fake.trapped()).length === 2, TRAP_MS)))
      throw new Error(`fake ${['claude', 'codex'].filter((cli) => !fake.trapped()[cli]).join(' and ')} never trapped SIGTERM in ${TRAP_MS / 1000} s`)
  }
  return {runs, trapped}
}

test('fails while its fakes hang', async () => {
  await hung().trapped()
  throw new Error('planted failure')
})

test('times out while its fakes hang', {timeout: 2000}, async () => {
  hung()
  await new Promise(() => {})
})

test('passes before the kill grace ends, even when its fakes boot slower than the timeout', async () => {
  await Promise.all(hung(BOOT_MS / 2).runs)
})

test('is still running when the run is killed', async () => {
  await hung().trapped()
  console.log('still running, fakes trapped')
  await new Promise(() => {})
})
