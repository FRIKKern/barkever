import {defineConfig} from 'vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import {loadServerEnv} from './scripts/local-env.ts'
import {buildStamp, serviceWorker} from './scripts/service-worker.ts'

export default defineConfig(({command, mode}) => {
  loadServerEnv(mode, command === 'serve')
  const build = buildStamp()
  return {
    server: {port: 3000},
    define: {'import.meta.env.BUILD': JSON.stringify(build)},
    plugins: [tanstackStart({importProtection: {behavior: 'error', client: {files: ['**/src/server/**']}}}), viteReact(), serviceWorker(build)],
  }
})
