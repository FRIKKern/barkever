import '@tanstack/react-start/server-only'
import {randomBytes} from 'node:crypto'
import {deleteCookie, getCookie, setCookie} from '@tanstack/react-start/server'
import {seal, unseal} from './seal'

export const COOKIE = 'bk_session'
const MAX_AGE = 60 * 60 * 24 * 30

type Session = {email: string; token: string; exp: number}
export type Me = {email: string | null} | null
export type SignIn = {email: string; password: string; code?: string}
type SignInResult = {ok: true} | {ok: false; mfa: boolean; message: string}

export const sharedToken = () => import.meta.env.DEV && process.env.BARKEVER_SHARED_TOKEN === '1'

let secret: string | undefined
function sessionSecret(): string {
  if (secret) return secret
  const set = process.env.BARKEVER_SESSION_SECRET
  if (set && set.length < 32) throw new Error('BARKEVER_SESSION_SECRET needs 32 or more random characters')
  if (!set) console.warn('[session] BARKEVER_SESSION_SECRET is not set: sign-ins end when this server restarts')
  return (secret = set ?? randomBytes(32).toString('base64url'))
}

function readSession(): Session | undefined {
  const raw = getCookie(COOKIE)
  const s = raw ? unseal<Session>(raw, sessionSecret()) : undefined
  return s && typeof s.email === 'string' && typeof s.token === 'string' && s.exp * 1000 > Date.now() ? s : undefined
}

export const sessionToken = () => readSession()?.token

const auth = (path: string, init: RequestInit = {}) =>
  fetch(`${process.env.BARKPARK_URL}/v1/auth${path}`, {...init, signal: AbortSignal.timeout(10_000)})

export async function whoAmI(): Promise<Me> {
  if (sharedToken()) return {email: null}
  const s = readSession()
  if (!s) return null
  const res = await auth('/me', {headers: {authorization: `Bearer ${s.token}`}}).catch(() => undefined)
  if (res?.status !== 401) return {email: s.email}
  deleteCookie(COOKIE, {path: '/'})
  return null
}

export async function signIn({email, password, code}: SignIn): Promise<SignInResult> {
  const res = await auth('/login', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({email: email.trim(), password, ...(code?.trim() && {totp_code: code.trim()})}),
  })
  const body = (await res.json().catch(() => ({}))) as {token?: string; user?: {email?: string}; error?: {code?: string}}
  if (res.ok && body.token) {
    const session: Session = {email: body.user?.email ?? email.trim().toLowerCase(), token: body.token, exp: Math.floor(Date.now() / 1000) + MAX_AGE}
    setCookie(COOKIE, seal(session, sessionSecret()), {httpOnly: true, sameSite: 'lax', secure: import.meta.env.PROD, path: '/', maxAge: MAX_AGE})
    return {ok: true}
  }
  const why = body.error?.code
  if (why === 'mfa_required') return {ok: false, mfa: true, message: code ? 'That code didn’t work. Try the next one.' : 'Enter the code from your authenticator app.'}
  if (why === 'invalid_credentials') return {ok: false, mfa: false, message: 'That email and password don’t match.'}
  return {ok: false, mfa: false, message: `Barkpark could not sign you in (${res.status}).`}
}

export async function signOut() {
  const s = readSession()
  deleteCookie(COOKIE, {path: '/'})
  if (s) await auth('/logout', {method: 'DELETE', headers: {authorization: `Bearer ${s.token}`}}).catch(() => undefined)
}
