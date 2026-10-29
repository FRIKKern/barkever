import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {extname, join, normalize} from 'node:path'
import {call, DATASET} from './bp.mjs'

const DIST = new URL('./dist/', import.meta.url).pathname
const TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'}

async function proxy(req, url) {
  if (req.method === 'POST' && url.pathname === '/bp/mutate') {
    let body = ''
    for await (const chunk of req) body += chunk
    return call('POST', `/v1/data/mutate/${DATASET}`, body)
  }
  const doc = url.pathname.match(/^\/bp\/doc\/(note|notebook)\/([^/]+)$/)
  if (req.method === 'GET' && doc) return call('GET', `/v1/data/doc/${DATASET}/${doc[1]}/${doc[2]}?perspective=drafts`)
}

export function start(port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x')
    try {
      const r = await proxy(req, url)
      if (r) return void res.writeHead(r.status, {'content-type': 'application/json'}).end(r.text)
      const path = normalize(join(DIST, url.pathname === '/' ? 'index.html' : url.pathname))
      if (!path.startsWith(DIST)) return void res.writeHead(403).end()
      const file = await readFile(path).catch(() => readFile(join(DIST, 'index.html')))
      res.writeHead(200, {'content-type': TYPES[extname(path)] ?? 'text/html', 'cache-control': 'no-store'}).end(file)
    } catch (err) {
      res.writeHead(502, {'content-type': 'application/json'}).end(JSON.stringify({error: err.message}))
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await start(5178)
  console.log('http://127.0.0.1:5178/?n=50')
}
