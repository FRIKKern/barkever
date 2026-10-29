import {defineConfig} from '@playwright/test'

export default defineConfig({
  testDir: '.',
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
})
