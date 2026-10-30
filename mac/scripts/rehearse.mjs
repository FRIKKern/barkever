#!/usr/bin/env node
import {chromium} from '@playwright/test'
import {execFileSync, spawn, spawnSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {signedBy} from './signature.mjs'

const MAC = fileURLToPath(new URL('..', import.meta.url))
const {version} = JSON.parse(readFileSync(join(MAC, 'package.json'), 'utf8'))
const dmg = process.argv[2] ?? join(MAC, 'dist', `Barkever-${version}-${process.arch}.dmg`)
const shot = join(MAC, 'dist', 'rehearsal.png')
const home = mkdtempSync('/tmp/barkever-rehearsal-')
const mount = join(home, 'mount')
const app = join(home, 'Applications', 'Barkever.app')
const rows = []

const sh = (cmd, args) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, TMPDIR: '/tmp/'}})
const said = (cmd, args) => {
  const r = spawnSync(cmd, args, {encoding: 'utf8', env: {...process.env, TMPDIR: '/tmp/'}})
  return r.stdout + r.stderr
}
const step = async (name, fn) => {
  const started = Date.now()
  const detail = await fn()
  rows.push([name, 'pass', `${Date.now() - started} ms`, detail ?? ''])
}

function devtools(child) {
  let err = ''
  return new Promise((done, fail) => {
    child.stderr.on('data', (d) => {
      err += d
      const ws = /DevTools listening on (ws:\/\/\S+)/.exec(err)?.[1]
      if (ws) done(ws.replace(/^ws/, 'http').replace(/\/devtools\/.*$/, ''))
    })
    child.once('exit', (code) => fail(new Error(`Barkever exited (${code}) before DevTools came up:\n${err}`)))
  })
}

async function launch() {
  const child = spawn(join(app, 'Contents/MacOS/Barkever'), ['--remote-debugging-port=0', '--use-mock-keychain'], {
    env: {HOME: process.env.HOME, USER: process.env.USER, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: '/tmp/', BARKEVER_USER_DATA: join(home, 'data')},
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const exited = new Promise((done) => child.once('exit', (code, signal) => done(signal ?? code)))
  const browser = await chromium.connectOverCDP(await devtools(child))
  return {browser, child, exited}
}

let run
try {
  if (!existsSync(dmg)) throw new Error(`no DMG at ${dmg}; run node mac/scripts/build.mjs first`)
  await step('mount DMG', () => (sh('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-mountpoint', mount]), dmg))
  await step('copy to Applications', () => {
    mkdirSync(join(home, 'Applications'))
    sh('ditto', [join(mount, 'Barkever.app'), app])
    sh('hdiutil', ['detach', mount])
    return app
  })
  const signer = signedBy(said('codesign', ['-dv', '--verbose=2', app]))
  await step('codesign --verify --deep --strict', () => (sh('codesign', ['--verify', '--deep', '--strict', app]), signer.label))
  await step('hardened runtime flag', () => {
    if (!signer.runtime) throw new Error('the runtime flag is not set')
    return 'flags include runtime'
  })
  if (signer.developerId) {
    await step('spctl --assess --type execute', () => sh('spctl', ['--assess', '--type', 'execute', '--verbose', app]).trim() || 'accepted')
    await step('xcrun stapler validate', () => sh('xcrun', ['stapler', 'validate', app]).trim().split('\n').pop())
  }
  await step('launch', async () => ((run = await launch()), 'DevTools up'))
  await step('window loads the app', async () => {
    const context = run.browser.contexts()[0]
    const page = context.pages()[0] ?? (await context.waitForEvent('page', {timeout: 30_000}))
    await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, {timeout: 30_000})
    await page.getByRole('heading', {name: 'Sign in'}).waitFor({timeout: 30_000})
    await page.screenshot({path: shot})
    return `${await page.title()} at ${page.url()}`
  })
  await step('quit', async () => {
    await run.browser.close()
    run.child.kill('SIGTERM')
    return `exit ${await run.exited}`
  })
} catch (e) {
  rows.push(['failed', 'FAIL', '', e.message.split('\n')[0]])
  process.exitCode = 1
} finally {
  if (run && run.child.exitCode === null && run.child.signalCode === null) run.child.kill('SIGKILL')
  if (existsSync(join(mount, 'Barkever.app'))) said('hdiutil', ['detach', mount, '-force'])
  rmSync(home, {recursive: true, force: true})
  rows.push(['clean up', existsSync(home) || said('hdiutil', ['info']).includes(mount) ? 'FAIL' : 'pass', '', `${home} gone, DMG detached`])
}

console.log('| Step | Result | Time | Detail |\n|---|---|---|---|')
for (const row of rows) console.log(`| ${row.join(' | ')} |`)
if (rows.some((r) => r[1] === 'FAIL')) process.exitCode = 1
else console.log(`\nScreenshot: ${shot}`)
