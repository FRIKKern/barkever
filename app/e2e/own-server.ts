import {execFileSync, spawn, type ChildProcess} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {SECRET} from './account'
import {DATASET} from './fixtures-cleanup'

const APP = fileURLToPath(new URL('..', import.meta.url))
const VITE = 'node_modules/vite/bin/vite.js'
const PORT = 3197

export const ORIGIN = `http://localhost:${PORT}`

const env = (stamp: string, secret = SECRET) => ({...process.env, BARKPARK_DATASET: DATASET, BARKEVER_SESSION_SECRET: secret, BARKEVER_BUILD: stamp})
const outDir = (stamp: string) => `dist/e2e-${stamp}`
const up = () => fetch(`${ORIGIN}/sign-in`).then(() => true, () => false)

export function build(stamp: string) {
  execFileSync(process.execPath, [VITE, 'build', '--outDir', outDir(stamp)], {cwd: APP, env: env(stamp), stdio: 'pipe'})
}

let running: {child: ChildProcess; gone: Promise<void>} | undefined

export async function stop() {
  running?.child.kill()
  await running?.gone
  running = undefined
}

export async function serve(stamp: string, secret?: string) {
  await stop()
  const child = spawn(process.execPath, [VITE, 'preview', '--outDir', outDir(stamp), '--port', String(PORT), '--strictPort'], {cwd: APP, env: env(stamp, secret), stdio: 'ignore'})
  running = {child, gone: new Promise<void>((done) => child.once('exit', () => done()))}
  for (let tries = 0; !(await up()); tries++) {
    if (tries > 100) throw new Error(`build ${stamp} did not start on ${ORIGIN}`)
    await new Promise((r) => setTimeout(r, 200))
  }
}
