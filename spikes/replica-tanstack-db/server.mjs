import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { exportNotes, getNote, mutate } from './bp.mjs'

const port = Number(process.argv[2] ?? 5178)
const dist = new URL('dist/', import.meta.url).pathname
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }
const state = { up: true, mutateCalls: 0, mutations: 0 }

const body = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => resolve(b)) })
const json = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }

const row = (d) => ({ _id: d._publishedId ?? d._id.replace(/^drafts\./, ''), _rev: d._rev, _updatedAt: d._updatedAt, title: d.title ?? '', notebook: d.notebook, tags: d.tags ?? [], body: d.body ?? { blocks: [] }, links: d.links ?? [] })

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  try {
    if (url.pathname === '/api/net') {
      if (url.searchParams.has('up')) state.up = url.searchParams.get('up') === '1'
      return json(res, 200, state)
    }
    if (url.pathname.startsWith('/api/') && !state.up) return json(res, 503, { error: { code: 'offline', message: 'spike: network down' } })
    if (url.pathname === '/api/pull') {
      const prefix = url.searchParams.get('set') === '5000' ? 'gen-note-' : 'fx-note-'
      const rows = (await exportNotes()).map(row).filter((r) => r._id.startsWith(prefix))
      return json(res, 200, rows)
    }
    if (url.pathname === '/api/mutate' && req.method === 'POST') {
      const payload = JSON.parse(await body(req))
      state.mutateCalls++
      state.mutations += payload.mutations.length
      const r = await mutate(payload.mutations)
      return json(res, r.status, r.body)
    }
    if (url.pathname.startsWith('/api/doc/')) {
      const r = await getNote(decodeURIComponent(url.pathname.slice('/api/doc/'.length)))
      return json(res, r.status, r.status === 200 ? row(r.body.result) : r.body)
    }
    const file = normalize(join(dist, url.pathname === '/' ? 'index.html' : url.pathname))
    if (!file.startsWith(dist)) return json(res, 403, {})
    const data = await readFile(file).catch(() => null)
    if (!data) return json(res, 404, {})
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(data)
  } catch (e) {
    json(res, 500, { error: { code: 'proxy', message: String(e.message).slice(0, 300) } })
  }
}).listen(port, () => console.log(`spike E on http://localhost:${port}`))
