import {expect, type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {barkpark, DATASET} from './fixtures-cleanup.ts'

export type Stored = {_id: string; _rev: string; title: string; tags: string[]; links: {_ref: string}[]; body: {blocks: {id: string; content?: {type: string; value?: string}[]}[]}}

export const block = (id: string, n: 'p0' | 'p1') => `${id}-${n}`

export async function copyKickoff(tag: string, change: (b: Stored['body']['blocks']) => Stored['body']['blocks'] = (b) => b): Promise<string> {
  const id = `j08-${tag}-${Date.now()}`
  const src = readFileSync(new URL('../../fixtures/notes.ndjson', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Stored).find((d) => d._id === 'fx-note-00')!
  const copied = JSON.parse(JSON.stringify(src.body).replaceAll('fx-note-00-', `${id}-`)) as Stored['body']
  const body = {...copied, blocks: change(copied.blocks)}
  const res = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{createOrReplace: {...src, _id: id, title: `AI Edit ${tag}`, body}}]})})
  if (!res.ok) throw new Error(`Barkpark mutate ${res.status}`)
  return id
}

export async function stored(id: string): Promise<Stored> {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=drafts&limit=2&filter[_id][in]=${id},drafts.${id}`)
  const docs = ((await res.json()) as {result: {documents: Stored[]}}).result.documents
  return docs.find((d) => d._id.startsWith('drafts.')) ?? docs[0]
}

export const content = (d: Stored) => JSON.stringify({title: d.title, tags: d.tags, links: d.links, body: d.body})

export function withText(d: Stored, blockId: string, value: string): string {
  const next = structuredClone(d)
  next.body.blocks.find((b) => b.id === blockId)!.content = [{type: 'text', value}]
  return content(next)
}

export async function selectBlocks(page: Page, from: string, to: string) {
  await expect(page.getByTestId('canvas').locator(`[data-bp-id="${to}"]`)).toBeVisible({timeout: 20_000})
  await page.evaluate(
    ([a, b]) => {
      const first = document.querySelector(`[data-bp-id="${a}"]`)!
      const last = document.querySelector(`[data-bp-id="${b}"]`)!
      ;(first.closest('[contenteditable="true"]') as HTMLElement).focus()
      const r = document.createRange()
      r.setStart(first, 0)
      r.setEnd(last, last.childNodes.length)
      getSelection()!.removeAllRanges()
      getSelection()!.addRange(r)
      document.dispatchEvent(new Event('selectionchange'))
    },
    [from, to],
  )
}

export const aiEdit = (page: Page) => page.getByTestId('ai-edit').filter({visible: true})

export async function runEdit(page: Page, instruction: string) {
  await aiEdit(page).click()
  await page.getByLabel('What should AI change?').fill(instruction)
  await page.keyboard.press('Enter')
}

export async function settled(page: Page) {
  await expect(page.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('save-status')).toHaveText('Saved')
}
