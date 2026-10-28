import '@tanstack/react-start/server-only'

function env(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`missing ${key} (see app/.env.example)`)
  return v
}

const config = () => ({
  base: `${env('BARKPARK_URL')}/w/${process.env.BARKPARK_WORKSPACE || 'barkever'}/p/${process.env.BARKPARK_PROJECT || 'default'}`,
  dataset: process.env.BARKPARK_DATASET || 'fixtures',
  token: env('BARKPARK_TOKEN'),
})

export const dataset = () => config().dataset

export function bpFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const {base, token} = config()
  const headers = new Headers(init.headers)
  headers.set('authorization', `Bearer ${token}`)
  return fetch(`${base}${path}`, {...init, headers})
}

export async function bpJson<T>(path: string): Promise<T> {
  const res = await bpFetch(path)
  if (!res.ok) throw new Error(`Barkpark ${res.status} on GET ${path.split('?')[0]}`)
  return (await res.json()) as T
}
