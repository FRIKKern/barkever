import {defineConfig} from '@playwright/test'
import {fillFromBarkparkCli} from '../../scripts/local-env.ts'
import {SECRET} from '../account.ts'
import {appServer, portFor, runName} from '../run.ts'

const PORT = await portFor('J10_PORT')
const DATASET = (process.env.J10_DATASET ||= runName('j10'))
process.env.BARKPARK_DATASET = DATASET
fillFromBarkparkCli()

export default defineConfig({
  testDir: '.',
  testMatch: 'j10.test.ts',
  globalSetup: './setup.ts',
  outputDir: `test-results/${DATASET}`,
  workers: 1,
  timeout: 300_000,
  reporter: [['list'], ['../cleanup.ts', {dataset: DATASET}]],
  use: {channel: 'chrome', baseURL: `http://localhost:${PORT}`},
  webServer: appServer(DATASET, PORT, SECRET),
})
