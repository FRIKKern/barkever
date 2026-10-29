import {browser} from './harness.mjs'
import {start} from './server.mjs'

const observe = (s) =>
  s.page.evaluate(() => {
    window.__slow = []
    new PerformanceObserver((l) => window.__slow.push(...l.getEntries().map((e) => ({name: e.name, d: e.duration, proc: Math.round(e.processingEnd - e.processingStart)})))).observe({type: 'event', durationThreshold: 16})
  })
const slow = (s) => s.page.evaluate(() => window.__slow.splice(0).filter((e) => e.name === 'keydown' || e.name === 'input').map((e) => `${e.name} ${e.d}ms (handler ${e.proc}ms)`))

const server = await start(5180)
const out = []
for (let run = 0; run < 3; run++) {
  for (const firstBox of ['#title', '#search']) {
    const s = await browser(50, 5180)
    await s.launch()
    await observe(s)
    await s.open((await s.page.evaluate(() => window.__spike.ids()))[0])
    await s.typeAtEnd(firstBox, 'abc', 30)
    await s.page.waitForTimeout(200)
    out.push({run, firstBox, events: await slow(s)})
    await s.ctx.close()
  }
}
server.close()
console.log(JSON.stringify(out, null, 1))
