import {readdirSync, readFileSync} from 'node:fs'
import {extname, join, relative} from 'node:path'
import type {Page, Request, Response} from '@playwright/test'
import {loadServerEnv} from '../scripts/local-env.ts'
import {untilWelcome} from './event-stream'
import {secretNames, secretNeedles} from './needles'
import {DATASET} from './fixtures-cleanup'
import {APP, buildDir} from './run'

const CLIENT = join(APP, buildDir(DATASET, 'app'), 'client')
const SERVER = join(APP, 'src/server')
const TYPE: Record<string, string> = {'.js': 'javascript', '.mjs': 'javascript', '.css': 'text/css'}

type Seen = {where: string; text: string}

export function serverSecrets() {
  const sources = (readdirSync(SERVER, {recursive: true}) as string[]).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => readFileSync(join(SERVER, f), 'utf8'))
  const env = {...process.env}
  loadServerEnv('production', true, env)
  return secretNeedles(secretNames(sources), env)
}

export async function servedFiles(page: Page) {
  const built = readdirSync(CLIENT, {recursive: true, withFileTypes: true})
    .filter((d) => d.isFile())
    .map((d) => `/${relative(CLIENT, join(d.parentPath, d.name))}`)
  const editor = (await (await page.request.get('/editor-files')).json()) as {script: string; styles: string[]}
  const files = await Promise.all(
    [...built, editor.script, ...editor.styles].map(async (p) => {
      const res = await page.request.get(p)
      return {p, want: TYPE[extname(p)], status: res.status(), type: String(res.headers()['content-type']), text: await res.text()}
    }),
  )
  return {files, built: built.length, editor: 1 + editor.styles.length}
}

const path = (url: string) => new URL(url).pathname

export async function capture(page: Page, cookie: () => Promise<string | undefined>) {
  const seen: Promise<Seen>[] = []
  const unreadable: string[] = []
  const routed = new Set<Request>()
  let streams = 0
  const body = (where: string, read: Promise<string>) =>
    seen.push(read.then((text) => ({where, text}), (e: Error) => (unreadable.push(`${where}: ${e.message.split('\n')[0]}`), {where, text: ''})))

  await page.route('**/_serverFn/**', async (route) => {
    const res = await route.fetch()
    const text = await res.text()
    routed.add(route.request())
    seen.push(Promise.resolve({where: `${route.request().method()} ${path(route.request().url())}`, text}))
    await route.fulfill({response: res, body: text})
  })

  page.on('response', (r: Response) => {
    const where = `${r.status()} ${path(r.url())}`
    seen.push(Promise.resolve({where: `${where} headers`, text: JSON.stringify(r.headers())}))
    if ((r.status() >= 300 && r.status() < 400) || routed.has(r.request())) return
    if (!r.headers()['content-type']?.startsWith('text/event-stream')) body(where, r.text())
    else {
      streams++
      body(`${where} stream`, cookie().then((c) => (c ? untilWelcome(r.url(), c) : Promise.reject(new Error('no session to read the stream with')))))
    }
  })

  return async () => ({seen: await Promise.all(seen), unreadable, streams})
}
