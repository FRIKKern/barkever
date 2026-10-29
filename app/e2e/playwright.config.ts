import {defineConfig} from '@playwright/test'
import {DATASET} from './fixtures-cleanup'

const PORT = Number(process.env.E2E_PORT || 3199)

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 45_000,
  reporter: [['list']],
  use: {channel: 'chrome', baseURL: `http://localhost:${PORT}`, viewport: {width: 1440, height: 900}},
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    cwd: '..',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    env: {BARKPARK_DATASET: DATASET},
  },
})
