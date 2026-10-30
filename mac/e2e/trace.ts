import type {BrowserContext, TestInfo} from '@playwright/test'

type Traced = Pick<BrowserContext, 'tracing'>
type Ended = Pick<TestInfo, 'status' | 'expectedStatus' | 'outputPath'>

let tracing: Traced | undefined

export async function traced(context: Traced) {
  await context.tracing.start({screenshots: true, snapshots: true})
  tracing = context
}

export async function keepTraceOnFailure(info: Ended) {
  const context = tracing
  tracing = undefined
  if (context && info.status !== info.expectedStatus) await context.tracing.stop({path: info.outputPath('trace.zip')})
}
