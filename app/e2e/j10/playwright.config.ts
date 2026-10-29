import {defineConfig} from '@playwright/test'
import {fillFromBarkparkCli} from '../../scripts/local-env.ts'
import {SECRET} from '../account.ts'

const PORT = Number(process.env.J10_PORT || 3198)
process.env.J10_DATASET ??= `j10-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`
process.env.BARKPARK_DATASET = process.env.J10_DATASET
fillFromBarkparkCli()

export default defineConfig({
  testDir: '.',
  testMatch: 'j10.test.ts',
  globalSetup: './setup.ts',
  workers: 1,
  timeout: 300_000,
  reporter: [['list']],
  use: {channel: 'chrome', baseURL: `http://localhost:${PORT}`},
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    cwd: '../..',
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    env: {BARKPARK_DATASET: process.env.J10_DATASET, BARKEVER_SESSION_SECRET: SECRET},
  },
})
