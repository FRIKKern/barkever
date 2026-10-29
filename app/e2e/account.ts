import {randomBytes} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {loadEnv} from 'vite'
import {unseal} from '../src/server/seal.ts'

const local = loadEnv('', fileURLToPath(new URL('..', import.meta.url)), 'BARKEVER_E2E_')
const email = process.env.BARKEVER_E2E_EMAIL || local.BARKEVER_E2E_EMAIL
const password = process.env.BARKEVER_E2E_PASSWORD || local.BARKEVER_E2E_PASSWORD
if (!email || !password) throw new Error('e2e signs in as a Barkpark test account seated in workspace barkever: set BARKEVER_E2E_EMAIL and BARKEVER_E2E_PASSWORD in app/.env.local')
export const ACCOUNT = {email, password}

process.env.BARKEVER_SESSION_SECRET ??= randomBytes(32).toString('base64url')
export const SECRET = process.env.BARKEVER_SESSION_SECRET
export const SESSION_FILE = fileURLToPath(new URL('.auth/session.json', import.meta.url))

export const sessionToken = (cookie: string) => unseal<{token: string}>(cookie, SECRET)?.token

export function userToken(): string {
  const {cookies} = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as {cookies: {name: string; value: string}[]}
  const token = sessionToken(cookies.find((c) => c.name === 'bk_session')?.value ?? '')
  if (!token) throw new Error('no signed-in session in e2e/.auth')
  return token
}

export const cli = () => JSON.parse(readFileSync(`${homedir()}/.config/barkpark/config.json`, 'utf8')) as {server: string; token: string}
