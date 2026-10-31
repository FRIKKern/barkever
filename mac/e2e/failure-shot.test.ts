import {test} from 'node:test'
import assert from 'node:assert/strict'
import {keepScreenshotOnFailure, watched} from './failure-shot.ts'

function context(open = true) {
  const shots: (string | undefined)[] = []
  const page = {screenshot: async (o?: {path?: string}) => void shots.push(o?.path)}
  const fake = {pages: () => (open ? [page] : [])}
  return {shots, fake: fake as unknown as Parameters<typeof watched>[0]}
}

const ended = (status: 'passed' | 'failed' | 'timedOut', expectedStatus: 'passed' | 'failed' = 'passed') => ({status, expectedStatus, outputPath: (f: string) => `/out/${f}`})

test('a test that fails keeps one screenshot of its window, and no trace', async () => {
  for (const status of ['failed', 'timedOut'] as const) {
    const {shots, fake} = context()
    watched(fake)
    await keepScreenshotOnFailure(ended(status))
    assert.deepEqual(shots, ['/out/failure.png'])
  }
})

test('a test that ends as expected keeps nothing, also an expected failure', async () => {
  for (const [status, expected] of [['passed', 'passed'], ['failed', 'failed']] as const) {
    const {shots, fake} = context()
    watched(fake)
    await keepScreenshotOnFailure(ended(status, expected))
    assert.deepEqual(shots, [])
  }
})

test('a screenshot is kept once, and a closed window keeps nothing', async () => {
  const {shots, fake} = context()
  watched(fake)
  await keepScreenshotOnFailure(ended('failed'))
  await keepScreenshotOnFailure(ended('failed'))
  assert.deepEqual(shots, ['/out/failure.png'])
  const closed = context(false)
  watched(closed.fake)
  await keepScreenshotOnFailure(ended('failed'))
  assert.deepEqual(closed.shots, [])
})
