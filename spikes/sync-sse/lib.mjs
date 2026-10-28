// Spike C: Barkpark listen SSE + Last-Event-ID as Barkever's catch-up feed.
// Talks raw HTTP to Barkpark. The token is read here and never printed.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const cfg = JSON.parse(readFileSync(`${homedir()}/.config/barkpark/config.json`, 'utf8'))
const TOKEN = cfg.token
export const SERVER = 'https://guerrilla.barkpark.cloud'
export const WS = 'barkever'
export const PROJECT = 'default'
export const DATASET = 'spike-sync-c' // never anything else
export const TYPE = 'spikenote'
const P = `/w/${WS}/p/${PROJECT}/v1`

export const stats = { requests: 0, retries429: 0 }
export const resetStats = () => { stats.requests = 0; stats.retries429 = 0 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function api(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    stats.requests++
    const res = await fetch(SERVER + P + path, {
      method,
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 429 && attempt < 20) {
      stats.retries429++
      const wait = Number(res.headers.get('retry-after') || 5)
      process.stderr.write(`  429 on ${method} ${path.split('?')[0]}, waiting ${wait}s\n`)
      await sleep(wait * 1000 + 250)
      continue
    }
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 300) } }
    if (!res.ok) {
      const err = new Error(`${method} ${path.split('?')[0]} -> ${res.status} ${text.slice(0, 300)}`)
      err.status = res.status
      throw err
    }
    return json
  }
}

export const mutate = (mutations) => api('POST', `/data/mutate/${DATASET}`, { mutations })

// Mutate in chunks so N=1000 fits the 60 writes/min bucket.
export async function mutateChunked(mutations, size = 100) {
  for (let i = 0; i < mutations.length; i += size) await mutate(mutations.slice(i, i + size))
}

// Server truth: every row of TYPE under the raw perspective (drafts and published).
export async function fetchAll() {
  const out = new Map()
  for (let offset = 0; ; ) {
    const r = await api('GET', `/data/query/${DATASET}/${TYPE}?perspective=raw&limit=1000&offset=${offset}&order=_id:asc`)
    for (const d of r.result.documents) out.set(d._id, d)
    if (!r.result.hasMore) break
    offset = r.result.nextOffset ?? offset + r.result.documents.length
  }
  return out
}

// Gap check: _id/_rev manifest only (content projected down to one small field).
export async function fetchManifest() {
  const out = new Map()
  for (let offset = 0; ; ) {
    const r = await api('GET', `/data/query/${DATASET}/${TYPE}?perspective=raw&limit=1000&offset=${offset}&order=_id:asc&fields=n`)
    for (const d of r.result.documents) out.set(d._id, d._rev)
    if (!r.result.hasMore) break
    offset = r.result.nextOffset ?? offset + r.result.documents.length
  }
  return out
}

// Minimal SSE client over fetch. onFrame({event, id, data}) for every frame.
// Returns {close(), done, lastEventId(), frames} .
export function listen({ lastEventId = null, onFrame = () => {}, query = '' } = {}) {
  const ac = new AbortController()
  let last = lastEventId
  const state = { frames: 0, closedBy: null }
  const done = (async () => {
    stats.requests++
    const headers = { authorization: `Bearer ${TOKEN}`, accept: 'text/event-stream' }
    if (lastEventId != null) headers['last-event-id'] = String(lastEventId)
    const res = await fetch(`${SERVER}${P}/data/listen/${DATASET}${query}`, { headers, signal: ac.signal })
    if (!res.ok) throw new Error(`listen -> ${res.status} ${(await res.text()).slice(0, 300)}`)
    const dec = new TextDecoder()
    let buf = ''
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true })
        let i
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, i)
          buf = buf.slice(i + 2)
          const f = { event: 'message', id: null, data: '' , comment: null }
          for (const line of raw.split('\n')) {
            if (line.startsWith(':')) f.comment = line.slice(1).trim()
            else if (line.startsWith('event:')) f.event = line.slice(6).trim()
            else if (line.startsWith('id:')) f.id = line.slice(3).trim()
            else if (line.startsWith('data:')) f.data += (f.data ? '\n' : '') + line.slice(5).trimStart()
          }
          if (f.data) { try { f.json = JSON.parse(f.data) } catch {} }
          if (f.id) last = f.id
          state.frames++
          onFrame(f)
        }
      }
      state.closedBy = 'server'
    } catch (e) {
      if (e.name === 'AbortError') state.closedBy = 'client'
      else { state.closedBy = 'error'; throw e }
    }
  })()
  return { close: () => ac.abort(), done, lastEventId: () => last, state }
}

// The replica: Map<_id, envelope>. Apply one mutation frame. Returns false if
// the frame kind is unknown (so tests can flag it).
export function applyFrame(replica, data) {
  const id = data.documentId
  const pub = id.replace(/^drafts\./, '')
  const draft = `drafts.${pub}`
  switch (data.mutation) {
    case 'create': case 'createOrReplace': case 'createIfNotExists': case 'replace': case 'patch':
    case 'update':
      replica.set(id, data.result); return true
    case 'publish':
      replica.delete(draft); replica.set(pub, data.result); return true
    case 'unpublish':
      replica.delete(pub); replica.set(draft, data.result); return true
    case 'discardDraft': case 'deleteExactDraft':
      replica.delete(draft); return true
    case 'delete':
      replica.delete(pub); replica.delete(draft); return true
    default:
      return false
  }
}

// Compare replica to server truth on _id and _rev (and content fields).
export function diff(replica, truth) {
  const missing = [], extra = [], stale = []
  for (const [id, d] of truth) {
    const r = replica.get(id)
    if (!r) missing.push(id)
    else if (r._rev !== d._rev || r.title !== d.title || r.n !== d.n) stale.push(id)
  }
  for (const id of replica.keys()) if (!truth.has(id)) extra.push(id)
  return { ok: !missing.length && !extra.length && !stale.length, missing, extra, stale }
}

export { sleep }
