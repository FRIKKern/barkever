import {defineConfig} from '@playwright/test'
import {DATASET} from './fixtures-cleanup'
import {SECRET, SESSION_FILE} from './account'

const PORT = Number(process.env.E2E_PORT || 3199)

export default defineConfig({
  testDir: '.',
  workers: 1,
  timeout: 45_000,
  reporter: [['list']],
  use: {channel: 'chrome', baseURL: `http://localhost:${PORT}`, viewport: {width: 1440, height: 900}},
  projects: [
    {name: 'sign-in', testMatch: 'sign-in.setup.ts', teardown: 'sign-out'},
    {name: 'sign-out', testMatch: 'sign-out.teardown.ts', use: {storageState: SESSION_FILE}},
    {name: 'app', testMatch: '*.spec.ts', dependencies: ['sign-in'], use: {storageState: SESSION_FILE}},
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    cwd: '..',
    url: `http://localhost:${PORT}/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    env: {BARKPARK_DATASET: DATASET, BARKEVER_SESSION_SECRET: SECRET},
  },
})
