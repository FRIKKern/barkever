import {fileURLToPath} from 'node:url'
import {defineConfig, loadEnv} from 'vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import {fillFromBarkparkCli} from './scripts/local-env.ts'

export default defineConfig(({command, mode}) => {
  // Server-only settings from app/.env*. Not VITE_-prefixed, so they never reach the client
  // bundle; the server reads them from process.env at run time. The shell wins over the files.
  const dir = fileURLToPath(new URL('.', import.meta.url))
  for (const [key, value] of Object.entries(loadEnv(mode, dir, ['BARKPARK_']))) process.env[key] ??= value
  // `vite dev` and `vite preview` on this Mac: the bp CLI's login fills what's still missing.
  if (command === 'serve') fillFromBarkparkCli()
  return {
    server: {port: 3000},
    // Server-only modules (src/server) imported into client code fail the build, not mock silently.
    plugins: [tanstackStart({importProtection: {behavior: 'error', client: {files: ['**/src/server/**']}}}), viteReact()],
  }
})
