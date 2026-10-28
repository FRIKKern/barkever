import {defineConfig} from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 3199)

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {channel: 'chrome', baseURL: `http://localhost:${PORT}`},
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    cwd: '..',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
  },
})
