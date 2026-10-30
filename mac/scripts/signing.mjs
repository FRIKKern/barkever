export const NOTARY_PROFILE = 'barkever-notary'
const PREFIX = 'Developer ID Application: '
const APPLE_ID = ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD']
const API_KEY = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']
const DEVELOPER_ID = /^\s*\d+\) ([0-9A-F]{40}) "Developer ID Application: (.+)"$/gm

export function developerIds(findIdentity) {
  const byHash = new Map([...findIdentity.matchAll(DEVELOPER_ID)].map((m) => [m[1], m[2]]))
  return [...byHash.values()]
}

function identityFrom(env, ids) {
  if (env.CSC_LINK) throw new Error('CSC_LINK is not supported: put the Developer ID Application identity in the login keychain instead')
  if (env.CSC_NAME) return {name: env.CSC_NAME.replace(PREFIX, ''), from: 'CSC_NAME'}
  if (ids.length > 1) throw new Error(`${ids.length} Developer ID Application identities in the keychain; pick one with CSC_NAME="<name>": ${ids.join(' | ')}`)
  return ids.length ? {name: ids[0], from: 'the keychain'} : null
}

function notaryFrom(env) {
  if (APPLE_ID.some((name) => env[name])) return {env: {}, says: 'APPLE_ID and its app-specific password'}
  if (API_KEY.some((name) => env[name])) return {env: {}, says: 'the APPLE_API_* key'}
  return {env: {APPLE_KEYCHAIN_PROFILE: NOTARY_PROFILE}, says: `keychain profile ${NOTARY_PROFILE}`}
}

export function signing(env, ids) {
  const identity = identityFrom(env, ids)
  if (!identity)
    return {
      developerId: false,
      config: {mac: {identity: '-', hardenedRuntime: true, notarize: false}},
      env: {CSC_IDENTITY_AUTO_DISCOVERY: 'false'},
      says: 'Signing ad hoc: no Developer ID Application identity in the keychain and no CSC_NAME.',
    }
  const notary = notaryFrom(env)
  return {
    developerId: true,
    config: {forceCodeSigning: true, mac: {identity: identity.name, hardenedRuntime: true, notarize: true}},
    env: notary.env,
    says: `Signing with Developer ID ${identity.name} from ${identity.from}; notarizing with ${notary.says}.`,
  }
}
