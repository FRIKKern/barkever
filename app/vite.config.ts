import {fileURLToPath} from 'node:url'
import {defineConfig, loadEnv} from 'vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import {fillFromBarkparkCli} from './scripts/local-env.ts'

export default defineConfig(({command, mode}) => {
  const dir = fileURLToPath(new URL('.', import.meta.url))
  for (const [key, value] of Object.entries(loadEnv(mode, dir, ['BARKPARK_']))) process.env[key] ??= value
  if (command === 'serve') fillFromBarkparkCli()
  return {
    server: {port: 3000},
    plugins: [tanstackStart({importProtection: {behavior: 'error', client: {files: ['**/src/server/**']}}}), viteReact()],
  }
})
