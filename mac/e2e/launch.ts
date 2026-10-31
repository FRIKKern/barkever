import {_electron as electron, chromium, expect, type Browser, type Page} from '@playwright/test'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {ACCOUNT} from '../../app/e2e/account.ts'
import {DATASET} from '../../app/e2e/fixtures-cleanup.ts'
import {watched} from './failure-shot.ts'

const ELECTRON = createRequire(import.meta.url)('electron') as string
const MAC = fileURLToPath(new URL('..', import.meta.url))

export type Keychain = 'mock' | 'real'
export type Run = {page: Page; browser: Browser; quit(): Promise<void>}

const appEnv = (data: string, env: Record<string, string>) => ({...(process.env as Record<string, string>), BARKEVER_USER_DATA: data, BARKPARK_DATASET: DATASET, ...env})

const running = new Set<() => Promise<void>>()

export async function quitAll() {
  await Promise.all([...running].map((stop) => stop()))
}

export async function launchDriven(data: string) {
  const app = await electron.launch({args: [MAC], env: appEnv(data, {})})
  const stop = () => app.close()
  running.add(stop)
  app.once('close', () => running.delete(stop))
  watched(app.context())
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
  const stop = async () => {
    running.delete(stop)
    child.kill('SIGTERM')
    await exited
  }
  running.add(stop)
  const http = await devtools(child)
  await expect.poll(() => loaded(http), {timeout: 30_000}).toBe(true)
  const browser = await chromium.connectOverCDP(http)
  watched(browser.contexts()[0]!)
  const page = browser.contexts()[0]!.pages()[0]!
  await page.waitForLoadState()
  return {
    page,
    browser,
    async quit() {
      await browser.close()
      await stop()
    },
  }
}

export async function signIn(page: Page) {
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/sign-in/, {timeout: 30_000})
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(ACCOUNT.email)
  await page.getByLabel('Password').fill(ACCOUNT.password)
  await page.getByRole('button', {name: 'Sign in'}).click()
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 30_000})
}
