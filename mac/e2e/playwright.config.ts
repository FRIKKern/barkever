import {defineConfig} from '@playwright/test'
import {DATASET} from '../../app/e2e/fixtures-cleanup.ts'

export default defineConfig({
  testDir: '.',
  globalSetup: '../../app/e2e/setup.ts',
  workers: 1,
  timeout: 120_000,
  reporter: [['list'], ['../../app/e2e/cleanup.ts', {dataset: DATASET}]],
})
