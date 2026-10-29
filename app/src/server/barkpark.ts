import '@tanstack/react-start/server-only'
import {barkparkConfig} from './config'
import {sessionToken, sharedToken} from './session'

const config = () => barkparkConfig()

export const dataset = () => config().dataset
export const origin = () => config().origin

export class BarkparkError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

function token(): string {
  const t = sessionToken() ?? (sharedToken() ? config().token() : undefined)
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
