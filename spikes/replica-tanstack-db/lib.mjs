import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { chromium } from 'playwright-core'

export const SET = process.argv[2] === '5000' ? '5000' : '50'
export const MODE = process.argv[3] === 'key' ? 'key' : 'idle'
export const ORIGIN = 'http://localhost:5178'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const URL_ = `${ORIGIN}/?set=${SET}${MODE === 'key' ? '&commit=key' : ''}`
export const PROFILE = `${process.env.TMPDIR ?? tmpdir()}/spike-e-profile-${SET}-${MODE}`

export const freshProfile = () => existsSync(PROFILE) && execFileSync('trash', [PROFILE])

const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : null
}
export const sum = (xs) => ({ n: xs.length, p50: q(xs, 0.5), p95: q(xs, 0.95), max: q(xs, 1) })
export const round = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v)]))
export const net = (up) => fetch(`${ORIGIN}/api/net?up=${up ? 1 : 0}`).then((r) => r.json())
export const serverDoc = (id) => fetch(`${ORIGIN}/api/doc/${id}`).then((r) => r.json())

export async function launch() {
  const ctx = await chromium.launchPersistentContext(PROFILE, { executablePath: CHROME, headless: true, viewport: { width: 1280, height: 900 } })
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => console.log('pageerror:', e.message))
  return { ctx, page }
}

export async function boot(page, reload = false) {
  if (reload) await page.reload()
  else await page.goto(URL_)
  await page.waitForFunction(() => window.__spike?.marks.firstListFrame, null, { timeout: 120000 })
  return round(await page.evaluate(() => __spike.marks))
}

export async function openRow(page, n) {
  await page.click(`#list li:nth-child(${n}) button`)
  await page.waitForSelector('#note[data-id]')
  return page.getAttribute('#note', 'data-id')
}

export async function typeAtEnd(page, sel, text, delay) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, sel)
  for (const c of text) {
    await page.keyboard.type(c)
    if (delay) await page.waitForTimeout(delay)
  }
}

export const drain = (page) =>
  page.evaluate(async () => {
    const { executor, stats } = __spike
    const n = (await executor.peekOutbox()).length
    const c0 = stats.conflicts
    const t0 = performance.now()
    executor.getOnlineDetector().notifyOnline()
    while (executor.getPendingCount() > 0 || (await executor.peekOutbox()).length > 0) await new Promise((r) => setTimeout(r, 5))
    return { entries: n, ms: Math.round(performance.now() - t0), conflicts412: stats.conflicts - c0 }
  })
