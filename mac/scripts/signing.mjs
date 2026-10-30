export const NOTARY_PROFILE = 'barkever-notary'
const API_KEY = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']
const DEVELOPER_ID = /^\s*\d+\) ([0-9A-F]{40}) "Developer ID Application: (.+)"$/gm

export function developerIds(findIdentity) {
  const byHash = new Map([...findIdentity.matchAll(DEVELOPER_ID)].map((m) => [m[1], m[2]]))
  return [...byHash.values()]
}

function identityFrom(env, ids) {
  if (env.CSC_NAME) return {name: env.CSC_NAME, from: 'CSC_NAME'}
  if (ids.length > 1) throw new Error(`${ids.length} Developer ID Application identities in the keychain; pick one with CSC_NAME="<name>": ${ids.join(' | ')}`)
  return ids.length ? {name: ids[0], from: 'the keychain'} : null
}

export function signing(env, ids) {
  const identity = identityFrom(env, ids)
  if (!identity)
    return {
      mac: {identity: '-', hardenedRuntime: true, notarize: false},
      env: {CSC_IDENTITY_AUTO_DISCOVERY: 'false'},
      says: 'Signing ad hoc: no Developer ID Application identity in the keychain and no CSC_NAME.',
    }
  const apiKey = API_KEY.some((name) => env[name])
  return {
    mac: {identity: identity.name, hardenedRuntime: true, notarize: true},
    env: apiKey ? {} : {APPLE_KEYCHAIN_PROFILE: NOTARY_PROFILE},
    says: `Signing with Developer ID ${identity.name} from ${identity.from}; notarizing with ${apiKey ? 'the APPLE_API_* key' : `keychain profile ${NOTARY_PROFILE}`}.`,
  }
}
