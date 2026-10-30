import {test} from 'node:test'
import assert from 'node:assert/strict'
import {keepTraceOnFailure, traced} from './trace.ts'

function context() {
  const stops: (string | undefined)[] = []
  const fake = {tracing: {start: async () => undefined, stop: async (o?: {path?: string}) => void stops.push(o?.path)}}
  return {stops, fake: fake as unknown as Parameters<typeof traced>[0]}
}

const ended = (status: 'passed' | 'failed' | 'timedOut', expectedStatus: 'passed' | 'failed' = 'passed') => ({status, expectedStatus, outputPath: (f: string) => `/out/${f}`})

test('a test that fails keeps its trace as trace.zip', async () => {
  for (const status of ['failed', 'timedOut'] as const) {
    const {stops, fake} = context()
    await traced(fake)
    await keepTraceOnFailure(ended(status))
    assert.deepEqual(stops, ['/out/trace.zip'])
  }
})

test('a test that ends as expected keeps no trace, also an expected failure', async () => {
  for (const [status, expected] of [['passed', 'passed'], ['failed', 'failed']] as const) {
    const {stops, fake} = context()
    await traced(fake)
    await keepTraceOnFailure(ended(status, expected))
    assert.deepEqual(stops, [])
  }
})

test('a trace is kept once: the next test with no launch of its own saves nothing', async () => {
  const {stops, fake} = context()
  await traced(fake)
  await keepTraceOnFailure(ended('failed'))
  await keepTraceOnFailure(ended('failed'))
  assert.deepEqual(stops, ['/out/trace.zip'])
})
