import {createServer} from 'node:net'
import {fileURLToPath} from 'node:url'

export const APP = fileURLToPath(new URL('..', import.meta.url))

export const runName = (kind: string) => `${kind}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${process.pid}`

export const buildDir = (dataset: string, name: string) => `dist/${dataset}/${name}`

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const s = createServer().once('error', fail)
    s.listen(0, () => {
      const {port} = s.address() as {port: number}
      s.close(() => done(port))
    })
  })
}

export async function portFor(key: string): Promise<number> {
  process.env[key] ||= String(await freePort())
  return Number(process.env[key])
}

export function appServer(dataset: string, port: number, secret: string) {
  const out = buildDir(dataset, 'app')
  return {
    command: `pnpm build --outDir ${out} && pnpm exec vite preview --outDir ${out} --port ${port} --strictPort`,
    cwd: APP,
    url: `http://localhost:${port}/sign-in`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe' as const,
    env: {BARKPARK_DATASET: dataset, BARKEVER_SESSION_SECRET: secret},
  }
}
