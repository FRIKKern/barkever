#!/usr/bin/env node
import {execFileSync, spawnSync} from 'node:child_process'
import {cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {bundlePackages} from './bundle-imports.mjs'
import {installedClosure} from './installed.mjs'
import {assertSigned, signedBy} from './signature.mjs'
import {developerIds, signing} from './signing.mjs'

if (process.platform !== 'darwin') {
  console.error('build.mjs builds the macOS app; run it on a Mac.')
  process.exit(2)
}

const MAC = fileURLToPath(new URL('..', import.meta.url))
const ROOT = join(MAC, '..')
const APP = join(ROOT, 'app')
const OUT = join(MAC, 'dist')
const json = (file) => JSON.parse(readFileSync(file, 'utf8'))
const run = (cmd, args, env = {}) => execFileSync(cmd, args, {cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], env: {...process.env, ...env}})

const sign = signing(process.env, developerIds(execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {encoding: 'utf8'})))
console.log(sign.says)

run('pnpm', ['--filter', '@barkever/app', 'build'])
const mac = json(join(MAC, 'package.json'))
const stage = mkdtempSync(join(tmpdir(), 'barkever-stage-'))
for (const part of ['client', 'server']) cpSync(join(APP, 'dist', part), join(stage, 'app/dist', part), {recursive: true})
cpSync(join(MAC, 'src'), join(stage, 'mac/src'), {recursive: true, filter: (f) => !f.endsWith('.test.ts')})

const roots = [...bundlePackages(join(APP, 'dist/server')).map((name) => [name, APP]), ...Object.keys(mac.dependencies).map((name) => [name, MAC])]
const modules = installedClosure(roots)
for (const [name, {dir}] of modules) cpSync(dir, join(stage, 'node_modules', name), {recursive: true, dereference: true})
const dependencies = Object.fromEntries(roots.map(([name]) => [name, modules.get(name).version]))
writeFileSync(join(stage, 'package.json'), JSON.stringify({name: 'barkever', productName: 'Barkever', version: mac.version, type: 'module', main: 'mac/src/main.ts', dependencies}, null, 2))

const config = {
  appId: 'no.guerrilla.barkever',
  productName: 'Barkever',
  electronVersion: json(join(MAC, 'node_modules/electron/package.json')).version,
  npmRebuild: false,
  directories: {output: OUT},
  files: ['package.json', 'mac/src/**', 'app/dist/**'],
  artifactName: 'Barkever-${version}-${arch}.${ext}',
  ...sign.config,
  mac: {target: ['dmg'], category: 'public.app-category.productivity', ...sign.config.mac},
  dmg: {sign: false},
}
const configFile = `${stage}.json`
writeFileSync(configFile, JSON.stringify(config, null, 2))
rmSync(OUT, {recursive: true, force: true})
try {
  run(join(MAC, 'node_modules/.bin/electron-builder'), ['--mac', `--${process.arch}`, '--publish', 'never', '--projectDir', stage, '--config', configFile], sign.env)
} finally {
  rmSync(stage, {recursive: true, force: true})
  rmSync(configFile, {force: true})
}

const built = join(OUT, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Barkever.app')
const dmg = join(OUT, `Barkever-${mac.version}-${process.arch}.dmg`)
for (const made of [built, dmg]) if (!existsSync(made)) throw new Error(`not built: ${made}`)
run('codesign', ['--verify', '--deep', '--strict', built])
const shown = spawnSync('codesign', ['-dv', '--verbose=2', built], {encoding: 'utf8'})
assertSigned(signedBy(shown.stderr), sign.signer)
if (sign.signer) run('xcrun', ['stapler', 'validate', built])
console.log(`Built ${built}\nBuilt ${dmg}`)
