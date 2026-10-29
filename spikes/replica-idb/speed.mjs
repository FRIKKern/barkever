import {readdirSync, readFileSync} from 'node:fs'
import {gzipSync} from 'node:zlib'
import {browser, median, picks, run, stats} from './harness.mjs'

const QUERIES = ['tulips', 'harbor', 'wire', 'kari', 'sourdough', 'offline', 'quarry naming', 'weekly sync', 'budget', 'lofoten',
  'decision', 'garden spring', 'risk', 'calm', 'printer', 'onboarding', 'fish soup', 'conference', 'mobile first', 'xyzzy']
const TEXT = ' the quick brown fox jumps over the lazy dog again and again'

function bundle() {
  const dir = new URL('./dist/assets/', import.meta.url).pathname
  const js = readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(dir + f))
  const kb = (f) => +(js.reduce((s, b) => s + f(b).length, 0) / 1024).toFixed(1)
  return {raw: kb((b) => b), gzip: kb(gzipSync)}
}

const summary = (xs) => Object.fromEntries(['firstList', 'firstListPaint', 'getAllMs', 'indexMs'].map((k) => [k, median(xs.map((x) => x[k]))]))

async function speed(n, port) {
  const s = await browser(n, port)
  const R = {bundleKB: bundle(), firstVisit: await s.launch()}
  R.heapMB = await s.page.evaluate(() => +(performance.memory.usedJSHeapSize / 1e6).toFixed(1))
  R.storageMB = await s.page.evaluate(async () => +((await navigator.storage.estimate()).usage / 1e6).toFixed(1))

  const reloads = []
  for (let i = 0; i < 5; i++) await s.page.reload(), reloads.push(await s.loaded())
  const restarts = []
  for (let i = 0; i < 3; i++) await s.ctx.close(), restarts.push(await s.launch())
  R.reload = summary(reloads)
  R.restart = summary(restarts)

  const ids = await s.page.evaluate(() => window.__spike.ids())
  const set = picks(ids, 50)
  for (const id of set) await s.open(id)
  for (const id of set) await s.open(id)
  const [sw, swp] = [await s.metric('switch'), await s.metric('switchPaint')]
  R.switchFirst = {commit: stats(sw.slice(0, 50)), paint: stats(swp.slice(0, 50))}
  R.switchCached = {commit: stats(sw.slice(50)), paint: stats(swp.slice(50))}

  const hits = {}
  for (const q of QUERIES) {
    const len = (await s.metric('searchPaint')).length
    await s.page.fill('#search', q)
    await s.waitMetric('searchPaint', len)
    hits[q] = await s.page.evaluate(() => window.__spike.metrics.lastHits)
  }
  R.search = {commit: stats(await s.metric('search')), paint: stats(await s.metric('searchPaint')), hits}

  await s.page.click('#search')
  await s.page.keyboard.type('x')
  await s.page.fill('#search', '')
  await s.page.evaluate(() => {
    window.__slow = []
    new PerformanceObserver((l) => window.__slow.push(...l.getEntries().map((e) => ({name: e.name, d: e.duration})))).observe({type: 'event', durationThreshold: 16})
  })
  await s.open(ids[0])
  await s.typeAtEnd('#title', TEXT, 30)
  await s.page.waitForTimeout(500)
  const slow = await s.page.evaluate(() => window.__slow.filter((e) => e.name === 'keydown').map((e) => e.d))
  R.keystroke = {
    keys: TEXT.length,
    input: stats(await s.metric('ksInput')), list: stats(await s.metric('ksList')), listPaint: stats(await s.metric('ksListPaint')), idb: stats(await s.metric('ksIdb')),
    keydownOver16: slow.filter((d) => d > 16), keydownAt16: slow.filter((d) => d === 16).length,
  }
  await s.ctx.close()
  return R
}

await run(5178, speed)
