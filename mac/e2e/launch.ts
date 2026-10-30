import {_electron as electron, chromium, expect, type Browser, type Page} from '@playwright/test'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {DATASET} from '../../app/e2e/fixtures-cleanup.ts'
import {traced} from './trace.ts'

const ELECTRON = createRequire(import.meta.url)('electron') as string
const MAC = fileURLToPath(new URL('..', import.meta.url))

export type Keychain = 'mock' | 'real'
export type Run = {page: Page; browser: Browser; quit(): Promise<void>}

const appEnv = (data: string, env: Record<string, string>) => ({...(process.env as Record<string, string>), BARKEVER_USER_DATA: data, BARKPARK_DATASET: DATASET, ...env})

export async function launchDriven(data: string) {
  const app = await electron.launch({args: [MAC], env: appEnv(data, {})})
  await traced(app.context())
  return app
}

async function devtools(child: ReturnType<typeof spawn>): Promise<string> {
  let out = ''
  return new Promise((done, fail) => {
    child.stderr!.on('data', (d) => {
      out += d
      const ws = /DevTools listening on (ws:\/\/[^\s]+)/.exec(out)?.[1]
      if (ws) done(ws.replace(/^ws/, 'http').replace(/\/devtools\/.*$/, ''))
    })
    child.once('exit', (code) => fail(new Error(`Barkever exited (${code}) before DevTools came up`)))
  })
}

const loaded = async (http: string) =>
  ((await (await fetch(`${http}/json/list`)).json()) as {type: string; url: string}[]).some((t) => t.type === 'page' && t.url.startsWith('http://127.0.0.1:'))

export async function launchPlain(data: string, keychain: Keychain, env: Record<string, string> = {}): Promise<Run> {
  const child = spawn(ELECTRON, [MAC, '--remote-debugging-port=0', ...(keychain === 'mock' ? ['--use-mock-keychain'] : [])], {env: appEnv(data, env), stdio: ['ignore', 'ignore', 'pipe']})
  const exited = new Promise((done) => child.once('exit', done))
  const http = await devtools(child)
  await expect.poll(() => loaded(http), {timeout: 30_000}).toBe(true)
  const browser = await chromium.connectOverCDP(http)
  await traced(browser.contexts()[0]!)
  const page = browser.contexts()[0]!.pages()[0]!
  await page.waitForLoadState()
  return {
    page,
    browser,
    async quit() {
      await browser.close()
      child.kill('SIGTERM')
      await exited
    },
  }
}
