import {strict as assert} from 'node:assert'
import {mkdirSync, mkdtempSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {bareImports, bundlePackages} from './bundle-imports.mjs'
import {installedClosure} from './installed.mjs'
import {assertSigned, signedBy} from './signature.mjs'
import {developerIds, NOTARY_PROFILE, signing} from './signing.mjs'

const h = (n) => n.toString(16).toUpperCase().padStart(40, '0')
const jane = 'Jane Doe (TEAM111111)'
const listing = (...rows) => `${rows.map(([hash, name], i) => `  ${i + 1}) ${hash} "${name}"`).join('\n')}\n     ${rows.length} valid identities found\n`
const pick = (env, ...rows) => signing(env, developerIds(listing(...rows)))
const devId = (n, name = jane) => [h(n), `Developer ID Application: ${name}`]

test('developer ids keep each Developer ID Application certificate once, by SHA-1, with its name', () => {
  const ids = developerIds(listing([h(1), 'Screenscribe Dev'], devId(3), [h(2), `Apple Development: ${jane}`], devId(3)))
  assert.deepEqual(ids, [{hash: h(3), name: jane}])
})

test('C1 auto: the one Developer ID signs by its SHA-1, past a dev cert and a self-made cert with the same name', () => {
  const sign = pick({}, [h(1), 'Apple Development: Jane Doe (PERS222222)'], [h(2), `${jane} local`], devId(3))
  assert.deepEqual(sign.config, {forceCodeSigning: true, mac: {identity: h(3), hardenedRuntime: true, notarize: true}})
  assert.equal(sign.signer, jane)
  assert.deepEqual(sign.env, {APPLE_KEYCHAIN_PROFILE: 'barkever-notary'})
  assert.equal(sign.says, `Signing with Developer ID ${jane} (${h(3)}) from the keychain; notarizing with keychain profile barkever-notary.`)
})

test('C2 a CSC_NAME shorthand that is not one exact Developer ID name refuses and lists the candidates', () => {
  assert.throws(() => pick({CSC_NAME: 'Jane Doe'}, devId(4, 'Jane Doe Consulting AS (TEAM999999)'), devId(3)), new RegExp(`matches 0 .*Jane Doe Consulting AS \\(TEAM999999\\) ${h(4)} \\| Jane Doe \\(TEAM111111\\) ${h(3)}`))
})

test('a CSC_NAME that is only a suffix of the one Developer ID name refuses', () => {
  for (const part of ['Doe (TEAM111111)', '(TEAM111111)']) assert.throws(() => pick({CSC_NAME: part}, devId(3)), /matches 0/)
})

test('C3 CSC_NAME refuses when only an Apple Development cert carries the name', () => {
  assert.throws(() => pick({CSC_NAME: 'Jane Doe'}, [h(1), 'Apple Development: Jane Doe (PERS222222)']), /matches 0 .*: none$/)
})

test('C4 CSC_NAME naming a self-made cert refuses', () => {
  assert.throws(() => pick({CSC_NAME: 'Screenscribe Dev'}, [h(5), 'Screenscribe Dev'], devId(3)), /CSC_NAME="Screenscribe Dev" matches 0/)
})

test('C5 CSC_NAME holding the SHA-1 of a non-Developer-ID cert refuses', () => {
  assert.throws(() => pick({CSC_NAME: h(1)}, [h(1), `Apple Distribution: ${jane}`], devId(3)), /matches 0/)
})

test('C6 CSC_NAME with a typo refuses instead of building unsigned', () => {
  assert.throws(() => pick({CSC_NAME: 'Jane Doe (TEAM11111X)'}, devId(3)), /matches 0/)
})

test('C7 auto: a self-made cert listed first with the Developer ID name does not change the pick', () => {
  assert.equal(pick({}, [h(6), jane], devId(3)).config.mac.identity, h(3))
})

test('C8 a renewal: two certs with one name refuse by name and list both hashes; either SHA-1 picks it', () => {
  assert.throws(() => pick({}, devId(7), devId(3)), new RegExp(`2 Developer ID Application identities.*${h(7)} \\| .*${h(3)}`))
  assert.throws(() => pick({CSC_NAME: jane}, devId(7), devId(3)), /matches 2/)
  const sign = pick({CSC_NAME: h(3)}, devId(7), devId(3))
  assert.equal(sign.config.mac.identity, h(3))
  assert.match(sign.says, /from CSC_NAME/)
})

test('C9 no Developer ID under -p codesigning signs ad hoc with the hardened runtime and never notarizes, whatever notary settings are around', () => {
  for (const env of [{}, {APPLE_API_KEY: 'k', APPLE_API_KEY_ID: 'i', APPLE_API_ISSUER: 's'}, {APPLE_KEYCHAIN_PROFILE: NOTARY_PROFILE}, {APPLE_ID: 'a@b.c'}]) {
    const sign = pick(env, [h(1), 'Screenscribe Dev'])
    assert.deepEqual(sign.config, {mac: {identity: '-', hardenedRuntime: true, notarize: false}})
    assert.equal(sign.signer, null)
    assert.deepEqual(sign.env, {CSC_IDENTITY_AUTO_DISCOVERY: 'false'})
    assert.match(sign.says, /ad hoc/)
  }
})

test('CSC_NAME as an exact name, with or without a copied prefix, picks that cert by SHA-1', () => {
  for (const name of [jane, `Developer ID Application: ${jane}`]) {
    const sign = pick({CSC_NAME: name}, devId(4, 'Jane Doe Consulting AS (TEAM999999)'), devId(3))
    assert.equal(sign.config.mac.identity, h(3))
    assert.equal(sign.signer, jane)
  }
})

test('CSC_LINK is refused, with or without CSC_NAME, so a certificate file never silently builds ad hoc', () => {
  for (const env of [{CSC_LINK: '/x.p12'}, {CSC_LINK: '/x.p12', CSC_NAME: jane}]) assert.throws(() => pick(env, devId(3)), /CSC_LINK is not supported/)
})

test('APPLE_ID or its app-specific password wins over the API key and the profile, the order electron-builder checks them in', () => {
  for (const env of [{APPLE_ID: 'a@b.c'}, {APPLE_APP_SPECIFIC_PASSWORD: 'x'}, {APPLE_ID: 'a@b.c', APPLE_API_KEY: 'k'}]) {
    const sign = pick(env, devId(3))
    assert.deepEqual(sign.env, {})
    assert.match(sign.says, /notarizing with APPLE_ID and its app-specific password\.$/)
  }
})

test('any APPLE_API_* variable means the API key path, so a partial key fails in electron-builder instead of falling back to the profile', () => {
  for (const name of ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) {
    const sign = pick({[name]: 'x'}, devId(3))
    assert.equal(sign.config.mac.identity, h(3))
    assert.deepEqual(sign.env, {})
    assert.match(sign.says, /APPLE_API_\* key/)
  }
})

test('what signing prints names the identity and the notary path, never a key value', () => {
  const says = pick({APPLE_API_KEY: '/keys/AuthKey_SECRET.p8', APPLE_API_KEY_ID: 'KEYID123', APPLE_API_ISSUER: 'issuer-uuid', APPLE_ID: 'x@y.z', APPLE_APP_SPECIFIC_PASSWORD: 'pw-secret'}, devId(3)).says
  for (const secret of ['AuthKey_SECRET', 'KEYID123', 'issuer-uuid', 'x@y.z', 'pw-secret']) assert.ok(!says.includes(secret))
})

test('a built app must carry the hardened runtime and exactly the signer the build chose', () => {
  const adhoc = signedBy('flags=0x10002(adhoc,runtime)')
  const developer = signedBy(`flags=0x10000(runtime)\nAuthority=Developer ID Application: ${jane}\nAuthority=Developer ID Certification Authority`)
  assertSigned(adhoc, null)
  assertSigned(developer, jane)
  assert.throws(() => assertSigned(signedBy('flags=0x20002(adhoc,linker-signed)'), null), /signed ad hoc without the hardened runtime/)
  assert.throws(() => assertSigned(adhoc, jane), new RegExp(`expected Developer ID Application: Jane Doe \\(TEAM111111\\), the app is signed ad hoc`))
  assert.throws(() => assertSigned(developer, null), /expected signed ad hoc, the app is Developer ID Application/)
  assert.throws(() => assertSigned(developer, 'Jane Doe Consulting AS (TEAM999999)'), /the app is Developer ID Application: Jane Doe \(TEAM111111\)/)
})

test('the signature reader tells ad hoc, Developer ID and the runtime flag apart', () => {
  assert.deepEqual(signedBy('CodeDirectory v=20500 size=630 flags=0x10002(adhoc,runtime) hashes=9+7\nSignature=adhoc'), {runtime: true, developerId: false, label: 'signed ad hoc'})
  assert.deepEqual(signedBy('CodeDirectory v=20500 flags=0x2(adhoc) hashes=9+7'), {runtime: false, developerId: false, label: 'signed ad hoc'})
  assert.deepEqual(signedBy(`CodeDirectory v=20500 flags=0x10000(runtime) hashes=9+7\nAuthority=Developer ID Application: ${jane}\nAuthority=Developer ID Certification Authority`), {runtime: true, developerId: true, label: `Developer ID Application: ${jane}`})
  assert.deepEqual(signedBy('code object is not signed at all'), {runtime: false, developerId: false, label: 'unsigned'})
  assert.deepEqual(signedBy(`flags=0x10000(runtime)\nAuthority=Apple Development: ${jane}\nAuthority=Apple Worldwide Developer Relations Certification Authority`), {runtime: true, developerId: false, label: `Apple Development: ${jane}`})
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
