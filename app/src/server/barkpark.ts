import '@tanstack/react-start/server-only'
import {sessionToken, sharedToken} from './session'

function env(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`missing ${key} (see app/.env.example)`)
  return v
}

const config = () => ({
  origin: env('BARKPARK_URL'),
  base: `${env('BARKPARK_URL')}/w/${process.env.BARKPARK_WORKSPACE || 'barkever'}/p/${process.env.BARKPARK_PROJECT || 'default'}`,
  dataset: process.env.BARKPARK_DATASET || 'fixtures',
})

export const dataset = () => config().dataset
export const origin = () => config().origin

export class BarkparkError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function token(): string {
  const t = sessionToken() ?? (sharedToken() ? env('BARKPARK_TOKEN') : undefined)
  if (!t) throw new BarkparkError(401, 'not signed in')
  return t
}

export function bpFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token()}`)
  headers.set('x-requested-with', 'barkever')
  if (init.body) headers.set('content-type', 'application/json')
  return fetch(`${config().base}${path}`, {...init, headers})
}

export async function bpJson<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await bpFetch(path, {method, body: body === undefined ? undefined : JSON.stringify(body)})
  if (!res.ok) throw new BarkparkError(res.status, `Barkpark ${res.status} on ${method} ${path.split('?')[0]}`)
  return (await res.json()) as T
}
