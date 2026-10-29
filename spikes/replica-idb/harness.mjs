import {chromium} from 'playwright-core'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {loadavg, tmpdir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {start} from './server.mjs'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const SIZES = (process.env.SIZES ?? '50,5000').split(',').map(Number)

const pct = (xs, p) => +[...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))].toFixed(1)
export const median = (xs) => pct(xs, 50)
export const stats = (xs) => ({n: xs.length, p50: pct(xs, 50), p95: pct(xs, 95), max: +Math.max(...xs).toFixed(1)})

export function picks(ids, k, seed = 7) {
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const out = []
  while (out.length < k) {
    const id = ids[Math.floor(rand() * ids.length)]
    if (id !== out.at(-1) && (out.length < k - 1 || id !== out[0])) out.push(id)
  }
  return out
}

export async function browser(n, port) {
  const profile = mkdtempSync(join(tmpdir(), `spike-f-${n}-`))
  const s = {url: `http://127.0.0.1:${port}/?n=${n}`}
  s.loaded = async () => {
    await s.page.waitForFunction(() => window.__spike?.metrics.firstListPaint !== undefined, null, {timeout: 120_000})
    return s.page.evaluate(() => {
      const {firstList, firstListPaint, getAllMs, indexMs, seedMs} = window.__spike.metrics
      return {firstList, firstListPaint, getAllMs, indexMs, seedMs}
    })
  }
  s.launch = async (before) => {
    s.ctx = await chromium.launchPersistentContext(profile, {executablePath: CHROME, headless: true, viewport: {width: 1200, height: 800}})
    s.page = s.ctx.pages()[0] ?? (await s.ctx.newPage())
    s.page.on('pageerror', (e) => console.error('pageerror', e.message))
    await before?.(s.ctx)
    await s.page.goto(s.url)
    return s.loaded()
  }
  s.metric = (k) => s.page.evaluate((k) => window.__spike.metrics[k] ?? [], k)
  s.waitMetric = (k, len) => s.page.waitForFunction(([k, len]) => (window.__spike.metrics[k]?.length ?? 0) > len, [k, len])
  s.outbox = () => s.page.evaluate(() => window.__spike.outboxSize())
  s.open = async (id) => {
    if ((await s.page.evaluate(() => window.__spike.selected)) !== id) {
      const len = (await s.metric('switchPaint')).length
      await s.page.evaluate((id) => window.__spike.open(id), id)
      await s.waitMetric('switchPaint', len)
    }
    return s.page.inputValue('#title')
  }
  s.typeAtEnd = async (sel, text, delay = 0) => {
    await s.page.click(sel)
    await s.page.$eval(sel, (el) => el.setSelectionRange(el.value.length, el.value.length))
    await s.page.keyboard.type(text, {delay})
  }
  return s
}

export async function run(port, measure) {
  const server = await start(port)
  const dir = new URL('./results/', import.meta.url).pathname
  mkdirSync(dir, {recursive: true})
  for (const n of SIZES) {
    const load = loadavg()[0]
    const R = {n, ...(await measure(n, port)), chrome: execFileSync(CHROME, ['--version'], {encoding: 'utf8'}).trim(), loadAvg: [+load.toFixed(1), +loadavg()[0].toFixed(1)], at: new Date().toISOString()}
    writeFileSync(join(dir, `${measure.name}-${n}${process.env.RUN ? `-${process.env.RUN}` : ''}.json`), JSON.stringify(R, null, 1) + '\n')
    console.log(`${measure.name} n=${n} done`)
  }
  server.close()
}
