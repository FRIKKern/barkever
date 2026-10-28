import {defineConfig} from '@playwright/test'

// Smoke: build, serve the production build (what users get), look at it in the installed
// Chrome (no browser download). The server reads Barkpark settings from app/.env.local or
// the bp CLI's login (scripts/local-env.ts). Never reuse a server already on the port:
// it may be another worktree's code.
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
