import {session} from 'electron'
import {COOKIE, memoryOnly} from './session-cookie.ts'
import type {Vault} from './vault.ts'

export function keepSession(origin: string, vault: Vault): Promise<void> {
  const jar = session.defaultSession
  jar.webRequest.onHeadersReceived({urls: [`${origin}/*`]}, (details, reply) => {
    const headers = details.responseHeaders ?? {}
    for (const key of Object.keys(headers).filter((k) => k.toLowerCase() === 'set-cookie'))
      headers[key] = headers[key]!.map((h) => {
        const kept = memoryOnly(h)
        if (!kept) return h
        vault.keep(kept.session)
        return kept.header
      })
    reply({responseHeaders: headers})
  })
  const value = vault.session()
  return value ? jar.cookies.set({url: origin, name: COOKIE, value, path: '/', httpOnly: true, secure: true, sameSite: 'lax'}) : Promise.resolve()
}
