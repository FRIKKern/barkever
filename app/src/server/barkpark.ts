// The only module that talks to Barkpark (decision 0003). Server-only: importing it
// from client code fails the build. The token stays on the server; the browser reaches
// Barkpark only through server functions.
import '@tanstack/react-start/server-only'

function env(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`missing ${key} (see app/.env.example)`)
  return v
}

const config = () => ({
  base: `${env('BARKPARK_URL')}/w/${process.env.BARKPARK_WORKSPACE || 'barkever'}/p/${process.env.BARKPARK_PROJECT || 'default'}`,
  // Fixtures unless told otherwise: an unset dataset never reads real notes.
  dataset: process.env.BARKPARK_DATASET || 'fixtures',
  token: env('BARKPARK_TOKEN'),
})

export const dataset = () => config().dataset

/** Fetch a Barkpark API path (`/v1/...`, dataset already in it) with the token attached. */
export function bpFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const {base, token} = config()
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  return fetch(`${base}${path}`, {...init, headers})
}

/** GET a path and parse JSON; a non-2xx answer throws with the status and path, never the token. */
export async function bpJson<T>(path: string): Promise<T> {
  const res = await bpFetch(path)
  if (!res.ok) throw new Error(`Barkpark ${res.status} on GET ${path.split('?')[0]}`)
  return (await res.json()) as T
}
