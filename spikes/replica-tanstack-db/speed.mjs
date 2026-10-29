import { boot, launch, openRow, sum, typeAtEnd } from './lib.mjs'

const terms = ['harbor', 'lighthouse', 'garden', 'quarry', 'budget', 'kickoff', 'sourdough', 'risk', 'weekly', 'crews', 'tulips', 'typeface', 'notif', 'deadline', 'plant', 'xyzzy', 'the', 'cook', 'mobile', 'estimate']
const samples = (page, kind) => page.evaluate((k) => __spike.samples[k], kind)
const count = (page, kind) => page.evaluate((k) => __spike.samples[k].length, kind)
const grew = (page, kind, n) => page.waitForFunction(([k, n]) => __spike.samples[k].length > n, [kind, n])

export async function firstRun(log) {
  const { ctx, page } = await launch()
  log('firstRun', await boot(page))
  log('replica', await page.evaluate(async () => ({
    notes: __spike.notes.size,
    storageMB: +((await navigator.storage.estimate()).usage / 1e6).toFixed(1),
    heapMB: +(performance.memory.usedJSHeapSize / 1e6).toFixed(1),
  })))
  await ctx.close()
}

export async function coldLoads(log, runs = 5) {
  const all = []
  for (let i = 0; ; i++) {
    const s = await launch()
    all.push(await boot(s.page))
    if (i === runs - 1) {
      log('coldLoad', { firstListFrame: sum(all.map((m) => m.firstListFrame)), idbLoaded: sum(all.map((m) => m.loaded)), runs: all })
      return s
    }
    await s.ctx.close()
  }
}

export async function speed(page, log) {
  for (let i = 0; i < 50; i++) {
    const n = await count(page, 'switch')
    await page.click(`#list li:nth-child(${i + 1}) button`)
    await grew(page, 'switch', n)
  }
  log('switch', sum(await samples(page, 'switch')))

  for (const t of terms) {
    const n = await count(page, 'search')
    await page.fill('#search', t)
    await grew(page, 'search', n)
  }
  log('search', sum(await samples(page, 'search')))
  await page.evaluate(() => (__spike.samples.search.length = 0))
  for (const t of ['lighthouse', 'sunday', 'wireframe']) {
    await page.fill('#search', '')
    await typeAtEnd(page, '#search', t, 60)
    await page.waitForTimeout(100)
  }
  log('searchTyped', sum(await samples(page, 'search')))
  await page.fill('#search', '')
  await page.waitForTimeout(100)

  await openRow(page, 4)
  const typed = ' The quick brown fox jumps over the lazy dog while the replica keeps every keystroke local first.'.padEnd(100, '.').slice(0, 100)
  await typeAtEnd(page, '#body', typed, 80)
  await typeAtEnd(page, '#title', ' typed title edit'.padEnd(30, '!'), 80)
  await page.waitForTimeout(800)
  const intact = await page.evaluate((t) => document.querySelector('#body').value.endsWith(t), typed)
  log('keystroke', { ...sum(await samples(page, 'key')), intact })
  await page.waitForFunction(() => __spike.executor.getPendingCount() === 0, null, { timeout: 60000 })
}
