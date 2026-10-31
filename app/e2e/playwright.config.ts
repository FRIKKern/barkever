import {defineConfig} from '@playwright/test'
import {DATASET} from './fixtures-cleanup'
import {SECRET, SESSION_FILE} from './account'
import {ORGANIZE} from './probe'
import {appServer, portFor} from './run'

const PORT = await portFor('E2E_PORT')
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

export default defineConfig({
  testDir: '.',
  globalSetup: './setup.ts',
  outputDir: `test-results/${DATASET}`,
  workers: 1,
  timeout: 45_000,
  reporter: [['list'], ['./cleanup.ts', {dataset: DATASET, also: [ORGANIZE]}]],
  use: {channel: 'chrome', baseURL: `http://localhost:${PORT}`, viewport: {width: 1440, height: 900}, trace: 'off', screenshot: 'off', video: 'off'},
  projects: [
    {name: 'sign-in', testMatch: 'sign-in.setup.ts', teardown: 'sign-out'},
    {name: 'sign-out', testMatch: 'sign-out.teardown.ts', use: {storageState: SESSION_FILE}},
    {name: 'app', testMatch: '*.spec.ts', dependencies: ['sign-in'], use: {storageState: SESSION_FILE}},
  ],
  webServer: appServer(DATASET, PORT, SECRET),
})
