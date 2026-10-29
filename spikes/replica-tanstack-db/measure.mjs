import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { MODE, SET, freshProfile, net } from './lib.mjs'
import { coldLoads, firstRun, speed } from './speed.mjs'
import { offline } from './offline.mjs'

const here = new URL('.', import.meta.url).pathname
const out = { set: SET, mode: MODE, at: new Date().toISOString() }
const log = (k, v) => {
  out[k] = v
  console.log(k, JSON.stringify(v))
}

freshProfile()
await net(true)
await firstRun(log)
const session = await coldLoads(log)
await speed(session.page, log)
await offline(session, log)

const js = readdirSync(`${here}dist/assets`).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${here}dist/assets/${f}`))
log('bundle', { kbRaw: Math.round(js.reduce((s, b) => s + b.length, 0) / 1024), kbGzip: Math.round(js.reduce((s, b) => s + gzipSync(b).length, 0) / 1024) })

mkdirSync(`${here}results`, { recursive: true })
writeFileSync(`${here}results/${SET}-${MODE}.json`, JSON.stringify(out, null, 1) + '\n')
