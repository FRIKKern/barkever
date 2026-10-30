import {strict as assert} from 'node:assert'
import {mkdirSync, mkdtempSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {bareImports} from './bundle-imports.mjs'
import {installedClosure} from './installed.mjs'
import {signedBy} from './signature.mjs'
import {NOTARY_PROFILE, signing} from './signing.mjs'

const fake = 'Not-a-real-identity (TEAM000000)'

test('no CSC_NAME signs ad hoc with the hardened runtime and never notarizes, whatever notary settings are around', () => {
  for (const env of [{}, {APPLE_API_KEY: 'k', APPLE_API_KEY_ID: 'i', APPLE_API_ISSUER: 's'}, {APPLE_KEYCHAIN_PROFILE: NOTARY_PROFILE}]) {
    const sign = signing(env)
    assert.deepEqual(sign.mac, {identity: '-', hardenedRuntime: true, notarize: false})
    assert.deepEqual(sign.env, {CSC_IDENTITY_AUTO_DISCOVERY: 'false'})
    assert.match(sign.says, /ad hoc/)
  }
})

test('CSC_NAME with no API key signs with it and notarizes through the barkever-notary keychain profile', () => {
  const sign = signing({CSC_NAME: fake})
  assert.deepEqual(sign.mac, {identity: fake, hardenedRuntime: true, notarize: true})
  assert.deepEqual(sign.env, {APPLE_KEYCHAIN_PROFILE: 'barkever-notary'})
  assert.match(sign.says, /keychain profile barkever-notary/)
})

test('any APPLE_API_* variable means the API key path, so a partial key fails in electron-builder instead of falling back to the profile', () => {
  for (const name of ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) {
    const sign = signing({CSC_NAME: fake, [name]: 'x'})
    assert.deepEqual(sign.env, {})
    assert.match(sign.says, /APPLE_API_\* key/)
  }
})

test('what signing prints names the identity and the notary path, never a key value', () => {
  const says = signing({CSC_NAME: fake, APPLE_API_KEY: '/keys/AuthKey_SECRET.p8', APPLE_API_KEY_ID: 'KEYID123', APPLE_API_ISSUER: 'issuer-uuid'}).says
  for (const secret of ['AuthKey_SECRET', 'KEYID123', 'issuer-uuid']) assert.ok(!says.includes(secret))
})

test('the signature reader tells ad hoc, Developer ID and the runtime flag apart', () => {
  assert.deepEqual(signedBy('CodeDirectory v=20500 size=630 flags=0x10002(adhoc,runtime) hashes=9+7\nSignature=adhoc'), {runtime: true, developerId: false, label: 'signed ad hoc'})
  assert.deepEqual(signedBy('CodeDirectory v=20500 flags=0x2(adhoc) hashes=9+7'), {runtime: false, developerId: false, label: 'signed ad hoc'})
  assert.deepEqual(signedBy(`CodeDirectory v=20500 flags=0x10000(runtime) hashes=9+7\nAuthority=Developer ID Application: ${fake}\nAuthority=Developer ID Certification Authority`), {runtime: true, developerId: true, label: `Developer ID Application: ${fake}`})
  assert.deepEqual(signedBy('code object is not signed at all'), {runtime: false, developerId: false, label: 'unsigned'})
})

test('bundle imports keep bare package names and drop relative, absolute, node: and non-package strings', () => {
  const code = `import {a} from "react";import "idb";import x from "@tanstack/react-router/ssr/server";const y = await import("./assets/a.js");import z from "/abs.js";import {c} from "node:crypto";const s = "from\\")) : ";export {q} from '@scope/pkg'`
  assert.deepEqual(bareImports(code), ['react', 'idb', '@tanstack/react-router', '@scope/pkg'])
})

function tree() {
  const root = mkdtempSync(join(tmpdir(), 'barkever-installed-'))
  const pkg = (dir, json) => (mkdirSync(dir, {recursive: true}), writeFileSync(join(dir, 'package.json'), JSON.stringify(json)), dir)
  const store = join(root, 'store')
  pkg(join(store, 'a@1/node_modules/a'), {version: '1.0.0', dependencies: {b: '^2'}, optionalDependencies: {gone: '1'}, peerDependencies: {c: '3'}})
  pkg(join(store, 'a@1/node_modules/b'), {version: '2.0.0'})
  pkg(join(store, 'c@3/node_modules/c'), {version: '3.0.0'})
  const app = join(root, 'app')
  mkdirSync(join(app, 'node_modules'), {recursive: true})
  symlinkSync(join(store, 'a@1/node_modules/a'), join(app, 'node_modules/a'))
  symlinkSync(join(store, 'c@3/node_modules/c'), join(app, 'node_modules/c'))
  return {root, app, pkg}
}

test('the installed closure follows symlinks to each dependency as installed and skips missing optional ones', () => {
  const {app} = tree()
  const picked = installedClosure([['a', app], ['c', app]])
  assert.deepEqual([...picked].map(([n, {version}]) => [n, version]), [['a', '1.0.0'], ['b', '2.0.0'], ['c', '3.0.0']])
  assert.match(picked.get('b').dir, /store\/a@1\/node_modules\/b$/)
})

test('the installed closure refuses a missing dependency and two versions of one package', () => {
  const {root, app, pkg} = tree()
  assert.throws(() => installedClosure([['nope', app]]), /nope is not installed/)
  pkg(join(root, 'other/node_modules/b'), {version: '9.0.0'})
  assert.throws(() => installedClosure([['a', app], ['b', join(root, 'other')]]), /two versions of b: 2.0.0 and 9.0.0/)
})
