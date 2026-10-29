export type Precache = {build: string; files: string[]}

declare const PRECACHE: Precache

type Waiting = Event & {waitUntil(p: Promise<unknown>): void}
type Fetching = Waiting & {request: Request; respondWith(r: Promise<Response>): void}
type Worker = {skipWaiting(): Promise<void>; clients: {claim(): Promise<void>}}

const worker = self as unknown as Worker
const CACHE = `barkever-${PRECACHE.build}`
const SHELL = '/'
const EDITOR = '/editor-files'
const FOUND = {cacheName: CACHE, ignoreVary: true}

const keep = (e: Waiting, key: RequestInfo, res: Response) => {
  if (res.ok) e.waitUntil(caches.open(CACHE).then((c) => c.put(key, res)))
}

async function editor(c: Cache) {
  const res = await fetch(EDITOR)
  if (!res.ok) return
  const files = (await res.clone().json()) as {script: string; styles: string[]}
  await c.addAll([files.script, ...files.styles])
  await c.put(EDITOR, res)
}

async function shell(c: Cache) {
  const res = await fetch(SHELL)
  if (res.ok && !res.redirected) await c.put(SHELL, res)
}

async function install() {
  await (await caches.open(CACHE)).addAll(PRECACHE.files)
  await worker.skipWaiting()
}

async function fill() {
  const c = await caches.open(CACHE)
  const missing = async (key: string, get: (c: Cache) => Promise<void>) => (await c.match(key)) || get(c).catch(() => undefined)
  await Promise.all([missing(SHELL, shell), missing(EDITOR, editor)])
}

async function activate() {
  for (const key of await caches.keys()) if (key.startsWith('barkever-') && key !== CACHE) await caches.delete(key)
  await worker.clients.claim()
  await fill()
}

async function page(e: Fetching, url: URL) {
  try {
    const res = await fetch(e.request)
    if (url.pathname === SHELL) keep(e, SHELL, res.clone())
    return res
  } catch {
    return (await caches.match(SHELL, FOUND)) ?? Response.error()
  }
}

async function fresh(e: Fetching) {
  try {
    const res = await fetch(e.request)
    keep(e, e.request, res.clone())
    return res
  } catch {
    return (await caches.match(e.request, FOUND)) ?? Response.error()
  }
}

async function stored(e: Fetching) {
  const hit = await caches.match(e.request, FOUND)
  if (hit) return hit
  const res = await fetch(e.request)
  keep(e, e.request, res.clone())
  return res
}

addEventListener('install', (e) => (e as Waiting).waitUntil(install()))
addEventListener('activate', (e) => (e as Waiting).waitUntil(activate()))
addEventListener('message', (e: Event) => (e as Waiting).waitUntil(fill()))
addEventListener('fetch', (event) => {
  const e = event as Fetching
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (e.request.mode === 'navigate') e.respondWith(page(e, url))
  else if (url.pathname === EDITOR) e.respondWith(fresh(e))
  else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/editor-assets/v/')) e.respondWith(stored(e))
})
