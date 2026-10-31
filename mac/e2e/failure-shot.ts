import type {BrowserContext, TestInfo} from '@playwright/test'

type Watched = Pick<BrowserContext, 'pages'>
type Ended = Pick<TestInfo, 'status' | 'expectedStatus' | 'outputPath'>

let watching: Watched | undefined

export function watched(context: Watched) {
  watching = context
}

export async function keepScreenshotOnFailure(info: Ended) {
  const context = watching
  watching = undefined
  if (context && info.status !== info.expectedStatus) await context.pages()[0]?.screenshot({path: info.outputPath('failure.png')})
}
