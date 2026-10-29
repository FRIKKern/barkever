import '@tanstack/react-start/server-only'
import {origin} from './barkpark'

export type CanvasFiles = {script: string; styles: string[]}

export const ASSET_PREFIX = '/editor-assets/'

const assetPath = (p: unknown): p is string => typeof p === 'string' && /^\/assets\/[\w./-]+$/.test(p) && !p.includes('..')
const local = (p: string) => ASSET_PREFIX + p.slice('/assets/'.length)

export async function canvasFiles(): Promise<CanvasFiles> {
  const res = await fetch(`${origin()}/v1/embed/canvas`, {signal: AbortSignal.timeout(3_000)})
  const body = (res.ok ? await res.json() : null) as Partial<CanvasFiles> | null
  if (!assetPath(body?.script) || !Array.isArray(body.styles) || !body.styles.every(assetPath)) throw new Error(`Barkpark ${res.status}: no canvas files`)
  return {script: local(body.script), styles: body.styles.map(local)}
}

export async function canvasAsset(rest: string): Promise<Response> {
  const p = `/assets/${rest}`
  if (!assetPath(p)) return new Response('not found', {status: 404})
  const res = await fetch(origin() + p)
  if (!res.ok) return new Response('not found', {status: res.status})
  const headers = new Headers({'content-type': res.headers.get('content-type') ?? 'application/octet-stream'})
  headers.set('cache-control', p.startsWith('/assets/v/') ? 'public, max-age=31536000, immutable' : 'no-cache')
  return new Response(res.body, {headers})
}
