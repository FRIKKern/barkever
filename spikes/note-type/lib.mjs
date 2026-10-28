// Tiny Barkpark HTTP client for the spike. The token is read here and never printed.
import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'

const cfg = JSON.parse(readFileSync(`${homedir()}/.config/barkpark/config.json`, 'utf8'))
export const ORIGIN = 'https://guerrilla.barkpark.cloud'
export const DS = 'spike-note-a'
export const BASE = `${ORIGIN}/w/barkever/p/default`

/** One request; returns {status, ms, body, headers}. Never throws on HTTP status. */
export async function bp(method, path, body) {
  const t0 = performance.now()
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return {status: res.status, ms: +(performance.now() - t0).toFixed(1), body: json, headers: Object.fromEntries(res.headers)}
}

export const mutate = (mutations) => bp('POST', `/v1/data/mutate/${DS}`, {mutations})
export const getDoc = (type, id, perspective = 'drafts') => bp('GET', `/v1/data/doc/${DS}/${type}/${encodeURIComponent(id)}?perspective=${perspective}`)
export const show = (label, r) => console.log(`\n## ${label} → ${r.status} (${r.ms} ms)\n${JSON.stringify(r.body, null, 1).slice(0, 1800)}`)

/** A PortableDoc body as Studio's fixtures write it (barkpark-studio fixtures/barkpark-only.ndjson). */
export const para = (id, ...content) => ({id, type: 'paragraph', content})
export const text = (value) => ({type: 'text', value})
export const wikilink = (docId, label) => ({type: 'wikilink', target: docId, docId, children: [text(label)]})
