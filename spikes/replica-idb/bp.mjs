import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'

const TOKEN = JSON.parse(readFileSync(`${homedir()}/.config/barkpark/config.json`, 'utf8')).token
export const DATASET = 'spike-replica-f'
const BASE = 'https://guerrilla.barkpark.cloud/w/barkever/p/default'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function call(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, {
      method,
      headers: {authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json'},
      body: body === undefined || typeof body === 'string' ? body : JSON.stringify(body),
    })
    const text = await res.text()
    if (res.status !== 429 || attempt >= 8) return {status: res.status, text}
    await sleep((Number(res.headers.get('retry-after') || '2') + 0.5) * 1000)
  }
}

export const mutate = (mutations) => call('POST', `/v1/data/mutate/${DATASET}`, {mutations})
export const getDoc = async (type, id) => JSON.parse((await call('GET', `/v1/data/doc/${DATASET}/${type}/${encodeURIComponent(id)}?perspective=drafts`)).text).result
