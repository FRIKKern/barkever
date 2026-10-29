import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const cfg = JSON.parse(readFileSync(`${homedir()}/.config/barkpark/config.json`, 'utf8'))
export const DATASET = 'spike-replica-e'
const BASE = 'https://guerrilla.barkpark.cloud/w/barkever/p/default'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function bp(method, path, body, { raw = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, {
      method,
      headers: { authorization: `Bearer ${cfg.token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    })
    const text = await res.text()
    if (res.status === 429 && attempt < 8) { await sleep((Number(res.headers.get('retry-after') || '3') + 1) * 1000); continue }
    let json = text
    if (!raw) try { json = JSON.parse(text) } catch {}
    return { status: res.status, body: json }
  }
}

export const mutate = (mutations) => bp('POST', `/v1/data/mutate/${DATASET}`, { mutations })

export async function exportNotes() {
  const r = await bp('GET', `/v1/data/export/${DATASET}?type=note&perspective=drafts`, undefined, { raw: true })
  if (r.status !== 200) throw new Error(`export ${r.status}: ${String(r.body).slice(0, 300)}`)
  return r.body.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((d) => !d._barkpark_export)
}

export const getNote = (id) => bp('GET', `/v1/data/doc/${DATASET}/note/${encodeURIComponent(id)}?perspective=drafts`)
