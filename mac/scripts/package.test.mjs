import {strict as assert} from 'node:assert'
import {mkdirSync, mkdtempSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {bareImports, bundlePackages} from './bundle-imports.mjs'
import {installedClosure} from './installed.mjs'
import {assertSigned, signedBy} from './signature.mjs'
import {developerIds, NOTARY_PROFILE, signing} from './signing.mjs'

const fake = 'Not-a-real-identity (TEAM000000)'
const other = 'Someone Else (TEAM111111)'
const hash = (c) => c.repeat(40)
const found = (...lines) => `${lines.map((l, i) => `  ${i + 1}) ${l}`).join('\n')}\n     ${lines.length} valid identities found\n`

test('developer ids are the Developer ID Application identities in find-identity output, once per certificate', () => {
  const out = found(`${hash('A')} "Screenscribe Dev"`, `${hash('B')} "Developer ID Application: ${fake}"`, `${hash('C')} "Apple Development: ${other}"`, `${hash('B')} "Developer ID Application: ${fake}"`)
  assert.deepEqual(developerIds(out), [fake])
  assert.deepEqual(developerIds(found(`${hash('A')} "Screenscribe Dev"`)), [])
  assert.deepEqual(developerIds(found(`${hash('B')} "Developer ID Application: ${fake}"`, `${hash('D')} "Developer ID Application: ${other}"`)), [fake, other])
})

test('no Developer ID and no CSC_NAME signs ad hoc with the hardened runtime and never notarizes, whatever notary settings are around', () => {
  for (const env of [{}, {APPLE_API_KEY: 'k', APPLE_API_KEY_ID: 'i', APPLE_API_ISSUER: 's'}, {APPLE_KEYCHAIN_PROFILE: NOTARY_PROFILE}]) {
    const sign = signing(env, [])
    assert.deepEqual(sign.config, {mac: {identity: '-', hardenedRuntime: true, notarize: false}})
    assert.equal(sign.developerId, false)
    assert.deepEqual(sign.env, {CSC_IDENTITY_AUTO_DISCOVERY: 'false'})
    assert.match(sign.says, /ad hoc/)
  }
})

test('the one Developer ID in the keychain signs with no env vars and notarizes through the barkever-notary keychain profile', () => {
  const sign = signing({}, [fake])
  assert.deepEqual(sign.config, {forceCodeSigning: true, mac: {identity: fake, hardenedRuntime: true, notarize: true}})
  assert.equal(sign.developerId, true)
  assert.deepEqual(sign.env, {APPLE_KEYCHAIN_PROFILE: 'barkever-notary'})
  assert.equal(sign.says, `Signing with Developer ID ${fake} from the keychain; notarizing with keychain profile barkever-notary.`)
})

test('two Developer IDs and no CSC_NAME refuse and name both; CSC_NAME picks one', () => {
  assert.throws(() => signing({}, [fake, other]), new RegExp(`2 Developer ID Application identities.*${fake.replace(/[()]/g, '\\$&')} \\| ${other.replace(/[()]/g, '\\$&')}`))
  const sign = signing({CSC_NAME: other}, [fake, other])
  assert.equal(sign.config.mac.identity, other)
  assert.match(sign.says, /from CSC_NAME/)
})

test('CSC_NAME signs with that name even when the keychain lists no Developer ID', () => {
  const sign = signing({CSC_NAME: fake}, [])
  assert.deepEqual(sign.config.mac, {identity: fake, hardenedRuntime: true, notarize: true})
  assert.deepEqual(sign.env, {APPLE_KEYCHAIN_PROFILE: 'barkever-notary'})
})

test('CSC_NAME copied with its "Developer ID Application:" prefix signs with the bare name electron-builder accepts', () => {
  const sign = signing({CSC_NAME: `Developer ID Application: ${fake}`}, [])
  assert.equal(sign.config.mac.identity, fake)
  assert.equal(sign.says, `Signing with Developer ID ${fake} from CSC_NAME; notarizing with keychain profile barkever-notary.`)
})

test('CSC_LINK is refused, with or without CSC_NAME, so a certificate file never silently builds ad hoc', () => {
  for (const env of [{CSC_LINK: '/x.p12'}, {CSC_LINK: '/x.p12', CSC_NAME: fake}]) assert.throws(() => signing(env, [fake]), /CSC_LINK is not supported/)
})

test('APPLE_ID or its app-specific password wins over the API key and the profile, the order electron-builder checks them in', () => {
  for (const env of [{APPLE_ID: 'a@b.c'}, {APPLE_APP_SPECIFIC_PASSWORD: 'x'}, {APPLE_ID: 'a@b.c', APPLE_API_KEY: 'k'}]) {
    const sign = signing(env, [fake])
    assert.deepEqual(sign.env, {})
    assert.match(sign.says, /notarizing with APPLE_ID and its app-specific password\.$/)
  }
})

test('any APPLE_API_* variable means the API key path, so a partial key fails in electron-builder instead of falling back to the profile', () => {
  for (const name of ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) {
    const sign = signing({[name]: 'x'}, [fake])
    assert.deepEqual(sign.config.mac, {identity: fake, hardenedRuntime: true, notarize: true})
    assert.deepEqual(sign.env, {})
    assert.match(sign.says, /APPLE_API_\* key/)
  }
})

test('what signing prints names the identity and the notary path, never a key value', () => {
  const says = signing({APPLE_API_KEY: '/keys/AuthKey_SECRET.p8', APPLE_API_KEY_ID: 'KEYID123', APPLE_API_ISSUER: 'issuer-uuid'}, [fake]).says
  for (const secret of ['AuthKey_SECRET', 'KEYID123', 'issuer-uuid']) assert.ok(!says.includes(secret))
})

test('a built app must carry the hardened runtime and the signature the build asked for', () => {
  const adhoc = signedBy('flags=0x10002(adhoc,runtime)')
  const developer = signedBy(`flags=0x10000(runtime)\nAuthority=Developer ID Application: ${fake}`)
  assertSigned(adhoc, false)
  assertSigned(developer, true)
  assert.throws(() => assertSigned(signedBy('flags=0x20002(adhoc,linker-signed)'), false), /signed ad hoc without the hardened runtime/)
  assert.throws(() => assertSigned(adhoc, true), /expected a Developer ID signature, the app is signed ad hoc/)
  assert.throws(() => assertSigned(developer, false), /expected an ad hoc signature, the app is Developer ID Application/)
})

test('the signature reader tells ad hoc, Developer ID and the runtime flag apart', () => {
  assert.deepEqual(signedBy('CodeDirectory v=20500 size=630 flags=0x10002(adhoc,runtime) hashes=9+7\nSignature=adhoc'), {runtime: true, developerId: false, label: 'signed ad hoc'})
  assert.deepEqual(signedBy('CodeDirectory v=20500 flags=0x2(adhoc) hashes=9+7'), {runtime: false, developerId: false, label: 'signed ad hoc'})
  assert.deepEqual(signedBy(`CodeDirectory v=20500 flags=0x10000(runtime) hashes=9+7\nAuthority=Developer ID Application: ${fake}\nAuthority=Developer ID Certification Authority`), {runtime: true, developerId: true, label: `Developer ID Application: ${fake}`})
  assert.deepEqual(signedBy('code object is not signed at all'), {runtime: false, developerId: false, label: 'unsigned'})
  assert.deepEqual(signedBy(`flags=0x10000(runtime)\nAuthority=Apple Development: ${fake}\nAuthority=Apple Worldwide Developer Relations Certification Authority`), {runtime: true, developerId: false, label: `Apple Development: ${fake}`})
})

test('bundle imports keep bare package names and drop relative, absolute, node: and non-package strings', () => {
  const code = `import {a} from "react";import "idb";import x from "@tanstack/react-router/ssr/server";const y = await import("./assets/a.js");import z from "/abs.js";import {c} from "node:crypto";const s = "from\\")) : ";export {q} from '@scope/pkg'`
  assert.deepEqual(bareImports(code), ['react', 'idb', '@tanstack/react-router', '@scope/pkg'])
})

test('bundle packages read every .js file under the folder, nested ones too, and nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'barkever-bundle-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'server.js'), 'import "react"; import a from "./assets/a.js"')
  writeFileSync(join(dir, 'assets/a.js'), 'import {b} from "idb"; import {c} from "react"')
  writeFileSync(join(dir, 'assets/a.js.map'), '{"sourcesContent": ["import x from \\"vite\\""]}')
  writeFileSync(join(dir, 'README.md'), 'import y from "nope"')
  assert.deepEqual(bundlePackages(dir), ['idb', 'react'])
})

function tree() {
  const root = mkdtempSync(join(tmpdir(), 'barkever-installed-'))
  const pkg = (dir, json) => (mkdirSync(dir, {recursive: true}), writeFileSync(join(dir, 'package.json'), JSON.stringify(json)), dir)
  const store = join(root, 'store')
  pkg(join(store, 'a@1/node_modules/a'), {version: '1.0.0', dependencies: {b: '^2'}, peerDependencies: {c: '3'}})
  pkg(join(store, 'a@1/node_modules/b'), {version: '2.0.0'})
  pkg(join(store, 'c@3/node_modules/c'), {version: '3.0.0'})
  symlinkSync(join(store, 'c@3/node_modules/c'), join(store, 'a@1/node_modules/c'))
  const app = join(root, 'app')
  mkdirSync(join(app, 'node_modules'), {recursive: true})
  symlinkSync(join(store, 'a@1/node_modules/a'), join(app, 'node_modules/a'))
  return {root, app, pkg}
}

test('the installed closure follows symlinks to each dependency and peer as installed', () => {
  const {app} = tree()
  const picked = installedClosure([['a', app]])
  assert.deepEqual([...picked].map(([n, {version}]) => [n, version]), [['a', '1.0.0'], ['b', '2.0.0'], ['c', '3.0.0']])
  assert.match(picked.get('b').dir, /store\/a@1\/node_modules\/b$/)
  assert.match(picked.get('c').dir, /store\/c@3\/node_modules\/c$/)
})

test('the installed closure refuses a missing dependency and two versions of one package', () => {
  const {root, app, pkg} = tree()
  assert.throws(() => installedClosure([['nope', app]]), /nope is not installed/)
  pkg(join(root, 'store/a@1/node_modules/b'), {version: '2.0.0', peerDependencies: {gone: '1'}})
  assert.throws(() => installedClosure([['a', app]]), /gone is not installed/)
  pkg(join(root, 'store/a@1/node_modules/b'), {version: '2.0.0'})
  pkg(join(root, 'other/node_modules/b'), {version: '9.0.0'})
  assert.throws(() => installedClosure([['a', app], ['b', join(root, 'other')]]), /two versions of b: 2.0.0 and 9.0.0/)
})
