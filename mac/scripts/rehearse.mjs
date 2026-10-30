#!/usr/bin/env node
import {_electron as electron} from '@playwright/test'
import {spawnSync} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {signedBy} from './signature.mjs'

const MAC = fileURLToPath(new URL('..', import.meta.url))
const {version} = JSON.parse(readFileSync(join(MAC, 'package.json'), 'utf8'))
const dmg = join(MAC, 'dist', `Barkever-${version}-${process.arch}.dmg`)
const shot = join(MAC, 'dist', 'rehearsal.png')
const home = mkdtempSync('/tmp/barkever-rehearsal-')
const mount = join(home, 'mount')
const app = join(home, 'Applications', 'Barkever.app')
const rows = []

const said = (cmd, args) => spawnSync(cmd, args, {encoding: 'utf8'})
const sh = (cmd, args) => {
  const r = said(cmd, args)
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed: ${(r.stderr + r.stdout).trim()}`)
  return r.stdout + r.stderr
}
const mounted = () => said('hdiutil', ['info']).stdout.includes(mount)
const step = async (name, fn) => {
  const started = Date.now()
  const detail = await fn()
  rows.push([name, 'pass', `${Date.now() - started} ms`, detail])
}

let barkever
let child
try {
  if (!existsSync(dmg)) throw new Error(`no DMG at ${dmg}; run node mac/scripts/build.mjs first`)
  await step('mount DMG', () => (sh('hdiutil', ['attach', dmg, '-nobrowse', '-readonly', '-mountpoint', mount]), dmg))
  await step('copy to Applications', () => {
    mkdirSync(join(home, 'Applications'))
    sh('ditto', [join(mount, 'Barkever.app'), app])
    sh('hdiutil', ['detach', mount])
    return app
  })
  const signer = signedBy(sh('codesign', ['-dv', '--verbose=2', app]))
  await step('codesign --verify --deep --strict', () => (sh('codesign', ['--verify', '--deep', '--strict', app]), signer.label))
  await step('hardened runtime flag', () => {
    if (!signer.runtime) throw new Error('the runtime flag is not set')
    return 'flags include runtime'
  })
  if (signer.developerId) {
    await step('spctl --assess --type execute', () => {
      const said = sh('spctl', ['--assess', '--type', 'execute', '--verbose', app])
      if (!said.includes('source=Notarized Developer ID')) throw new Error(`spctl did not see a notarized Developer ID: ${said.trim()}`)
      return 'accepted, source=Notarized Developer ID'
    })
    await step('xcrun stapler validate', () => sh('xcrun', ['stapler', 'validate', app]).trim().split('\n').pop())
  }
  await step('launch', async () => {
    barkever = await electron.launch({
      executablePath: join(app, 'Contents/MacOS/Barkever'),
      args: ['--use-mock-keychain'],
      env: {HOME: process.env.HOME, USER: process.env.USER, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: '/tmp/', BARKEVER_USER_DATA: join(home, 'data')},
    })
    child = barkever.process()
    return `pid ${child.pid}`
  })
  await step('window loads the app', async () => {
    const page = await barkever.firstWindow()
    await page.getByRole('heading', {name: 'Sign in'}).waitFor({timeout: 30_000})
    const worker = await page.evaluate(() =>
      Promise.race([navigator.serviceWorker.ready.then((r) => r.active.scriptURL), new Promise((_, no) => setTimeout(() => no(new Error('no service worker within 15 s: the client never ran')), 15_000))]),
    )
    await page.screenshot({path: shot})
    return `${await page.title()} at ${page.url()}, hydrated, service worker ${new URL(worker).pathname}`
  })
  await step('quit', async () => {
    await barkever.close()
    if (child.exitCode !== 0) throw new Error(`Barkever quit with exit ${child.exitCode}, signal ${child.signalCode}`)
    return 'exit 0'
  })
} catch (e) {
  rows.push(['failed', 'FAIL', '', e.message.split('\n')[0]])
} finally {
  if (child?.exitCode === null) child.kill('SIGKILL')
  if (mounted()) said('hdiutil', ['detach', mount, '-force'])
  if (!mounted()) rmSync(home, {recursive: true, force: true})
  const left = [mounted() && mount, existsSync(home) && home].filter(Boolean)
  rows.push(['clean up', left.length ? 'FAIL' : 'pass', '', left.length ? `left behind: ${left.join(', ')}` : 'temp folder gone, DMG detached'])
}

console.log('| Step | Result | Time | Detail |\n|---|---|---|---|')
for (const row of rows) console.log(`| ${row.join(' | ')} |`)
if (rows.some((r) => r[1] === 'FAIL')) process.exitCode = 1
else console.log(`\nScreenshot: ${shot}`)
