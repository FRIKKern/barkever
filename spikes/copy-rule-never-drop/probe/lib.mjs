import {readFileSync} from 'node:fs'
import {chromium} from '@playwright/test'
import {bp} from './bp.mjs'
export const DS = process.env.DS ?? readFileSync(new URL('./ds.txt', import.meta.url), 'utf8').trim()
export const BASE = process.env.BASE ?? 'http://localhost:3196'
const env = () => Object.fromEntries(readFileSync('../barkever/app/.env.local', 'utf8').split('\n').map((l) => l.replace(/^export\s+/, '').match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.trim().replace(/^['"]|['"]$/g, '')]))
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export async function browser() { return chromium.launch({channel: 'chrome', headless: true}) }
export async function device(b) {
  const context = await b.newContext({baseURL: BASE, viewport: {width: 1440, height: 900}})
  const page = await context.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(e.message))
  const e = env()
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(e.BARKEVER_E2E_EMAIL)
  await page.getByLabel('Password').fill(e.BARKEVER_E2E_PASSWORD)
  await page.getByRole('button', {name: 'Sign in'}).click()
  await page.getByTestId('note-row').first().waitFor({timeout: 30_000})
  return page
}
export const until = async (f, ms = 15_000, every = 50) => { const t = Date.now(); for (;;) { const v = await f(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout ' + f.toString().slice(0, 120)); await sleep(every) } }
export const text = (page, id) => page.getByTestId(id).textContent()
export const synced = (page, ms = 15_000) => until(async () => (await text(page, 'sync-status').catch(() => '')) === 'Synced', ms)
export const saved = (page, ms = 15_000) => until(async () => /^(Saved|Offline · saved on this device)$/.test((await text(page, 'save-status').catch(() => '')) ?? ''), ms)
export const leave = (page) => page.evaluate(() => document.activeElement?.blur())
export async function typeAtEndOf(page, index, s) {
  const block = page.getByTestId('canvas').locator('[contenteditable="true"] > [data-bp-id]').nth(index)
  await block.waitFor({state: 'attached'})
  const box = await block.boundingBox()
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2)
  await page.keyboard.press('End')
  await page.keyboard.type(s)
}
export async function newNote(page, title, body) {
  await page.goto('/')
  await page.getByTestId('new-note').waitFor()
  await until(() => page.getByTestId('new-note').isEnabled())
  await page.keyboard.press('n')
  await until(() => page.evaluate(() => document.activeElement?.dataset?.testid === 'title'))
  const id = new URL(page.url()).searchParams.get('n')
  await page.keyboard.type(title)
  await page.getByTestId('canvas').locator('[contenteditable="true"]').waitFor({state: 'attached'})
  await page.keyboard.press('Enter')
  await page.keyboard.type(body)
  await saved(page)
  return id
}
const blockText = (b) => (b?.content ?? []).map((c) => c.value ?? (c.children ?? []).map((x) => x.value).join('')).join('')
export async function serverNote(id) {
  const r = await bp(`/v1/data/query/${DS}/note?perspective=drafts&filter[_id][in]=${id},drafts.${id}`)
  return (await r.json()).result.documents[0]
}
export const everything = (n) => (n ? [n, ...(n.conflicts ?? [])].flatMap((v) => [v.title ?? '', ...(v.body?.blocks ?? []).map(blockText)]).join(' | ') : '')
export const summary = (n) => n && ({rev: n._rev?.slice(0, 6), by: n.by?.slice(0, 8), title: n.title, p: n.body?.blocks.map(blockText), copies: (n.conflicts ?? []).map((c) => ({by: c.by?.slice(0, 8), clash: c.clash, title: c.title, p: c.body?.blocks.map(blockText)}))})
export const deviceOf = (page) => page.evaluate(() => Object.entries(localStorage).find(([k]) => k.endsWith('-device'))?.[1])
export {bp, blockText}
