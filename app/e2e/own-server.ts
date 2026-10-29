import {execFileSync, spawn, type ChildProcess} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {SECRET} from './account'
import {DATASET} from './fixtures-cleanup'

const APP = fileURLToPath(new URL('..', import.meta.url))
const VITE = 'node_modules/vite/bin/vite.js'
const PORT = Number(process.env.E2E_OWN_PORT || 3197)

export const ORIGIN = `http://localhost:${PORT}`

type Options = {secret?: string; dataset?: string}

const env = (stamp: string, {secret = SECRET, dataset = DATASET}: Options = {}) => ({...process.env, BARKPARK_DATASET: dataset, BARKEVER_SESSION_SECRET: secret, BARKEVER_BUILD: stamp})
const outDir = (stamp: string) => `dist/e2e-${stamp}`
const up = (stamp: string) => fetch(`${ORIGIN}/sign-in`).then((r) => r.text()).then((html) => html.includes(`content="${stamp}"`), () => false)

export function build(stamp: string) {
  execFileSync(process.execPath, [VITE, 'build', '--outDir', outDir(stamp)], {cwd: APP, env: env(stamp), stdio: 'pipe'})
}

let running: {child: ChildProcess; gone: Promise<void>} | undefined

export async function stop() {
  running?.child.kill()
  await running?.gone
  running = undefined
}

export async function serve(stamp: string, options?: Options) {
  await stop()
  const child = spawn(process.execPath, [VITE, 'preview', '--outDir', outDir(stamp), '--port', String(PORT), '--strictPort'], {cwd: APP, env: env(stamp, options), stdio: 'ignore'})
  running = {child, gone: new Promise<void>((done) => child.once('exit', () => done()))}
  for (let tries = 0; !(await up(stamp)); tries++) {
    if (tries > 100 || running?.child.exitCode != null) throw new Error(`build ${stamp} is not what answers on ${ORIGIN}; is the port taken? set E2E_OWN_PORT`)
    await new Promise((r) => setTimeout(r, 200))
  }
}
