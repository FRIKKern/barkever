import {defineConfig} from '@playwright/test'
import {DATASET} from '../../app/e2e/fixtures-cleanup.ts'

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

export default defineConfig({
  testDir: '.',
  globalSetup: ['./setup.ts', '../../app/e2e/setup.ts'],
  workers: 1,
  timeout: 120_000,
  reporter: [['list'], ['../../app/e2e/cleanup.ts', {dataset: DATASET}]],
  use: {trace: 'off', screenshot: 'off', video: 'off'},
})
