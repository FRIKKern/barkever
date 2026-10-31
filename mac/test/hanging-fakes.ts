import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {claude} from '../src/ai/claude.ts'
import {codex} from '../src/ai/codex.ts'
import {fakeBin} from '../src/ai/fakes.ts'
import {childEnv} from '../src/ai/provider.ts'

async function hung(timeoutMs = 60_000) {
  const fake = fakeBin({claude: 'hang', codex: 'hang'})
  const env = childEnv({...process.env, HOME: fake.home, CODEX_HOME: '', CLAUDE_CONFIG_DIR: ''}, `${fake.dir}:${process.env.PATH}`)
  const call = {system: '', prompt: 'Question: x', schema: {}, env, timeoutMs}
  const runs = [claude(join(fake.dir, 'claude')), codex(join(fake.dir, 'codex'))].map((p) => p.run({...call, cwd: mkdtempSync(join(tmpdir(), 'barkever-ai-'))}).catch(() => {}))
  while (Object.keys(fake.trapped()).length < 2) await new Promise((r) => setTimeout(r, 50))
  return runs
}

test('fails while its fakes hang', async () => {
  await hung()
  throw new Error('planted failure')
})

test('times out while its fakes hang', {timeout: 2000}, async () => {
  await hung()
  await new Promise(() => {})
})

test('passes before the kill grace ends', async () => {
  await Promise.all(await hung(500))
})

test('is still running when the run is killed', async () => {
  await hung()
  await new Promise(() => {})
})
