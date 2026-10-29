import {defineConfig} from 'vite'
import {tanstackStart} from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import {loadServerEnv} from './scripts/local-env.ts'

export default defineConfig(({command, mode}) => {
  loadServerEnv(mode, command === 'serve')
  return {
    server: {port: 3000},
    plugins: [tanstackStart({importProtection: {behavior: 'error', client: {files: ['**/src/server/**']}}}), viteReact()],
  }
})
