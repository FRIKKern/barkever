export const NOTARY_PROFILE = 'barkever-notary'
const API_KEY = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']

export function signing(env) {
  if (!env.CSC_NAME)
    return {
      mac: {identity: '-', hardenedRuntime: true, notarize: false},
      env: {CSC_IDENTITY_AUTO_DISCOVERY: 'false'},
      says: 'Signing ad hoc: no CSC_NAME in the environment.',
    }
  const apiKey = API_KEY.some((name) => env[name])
  return {
    mac: {identity: env.CSC_NAME, hardenedRuntime: true, notarize: true},
    env: apiKey ? {} : {APPLE_KEYCHAIN_PROFILE: NOTARY_PROFILE},
    says: `Signing with ${env.CSC_NAME}; notarizing with ${apiKey ? 'the APPLE_API_* key' : `keychain profile ${NOTARY_PROFILE}`}.`,
  }
}
