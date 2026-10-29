import {expect, type Page} from '@playwright/test'
import type {Block} from '../../src/lib/model.ts'
import type {Doc} from '../../src/replica/note.ts'
import type {Made, Op, Writer} from './writer.ts'
import {ACCOUNT} from '../account.ts'

export type Replica = {docs: Map<string, Doc>; outbox: number; waiting: string[]}

export async function readReplica(page: Page): Promise<Replica> {
  const raw = await page.evaluate(async () => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))
    if (!name) throw new Error('no replica yet')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(name)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    const all = (store: string) =>
      new Promise<unknown[]>((resolve) => {
        const r = db.transaction(store).objectStore(store).getAll()
        r.onsuccess = () => resolve(r.result)
      })
    const outbox = (await all('outbox')) as {id: string; failed?: {n: number; why: string}}[]
    const out = {notes: await all('notes'), notebooks: await all('notebooks'), outbox: outbox.length, waiting: outbox.map((e) => (e.failed ? `${e.id} (${e.failed.why} ×${e.failed.n})` : e.id))}
    db.close()
    return out
  })
  const docs = [...raw.notes, ...raw.notebooks].map((d) => {
    const {_gen, ...rest} = d as Doc & {_gen?: number}
    return rest as Doc
  })
  return {docs: new Map(docs.map((d) => [d._id, d])), outbox: raw.outbox, waiting: raw.waiting}
}

export async function signIn(page: Page) {
  await page.goto('/')
  await expect(page).toHaveURL(/\/sign-in/)
  await page.getByLabel('Email').fill(ACCOUNT.email)
  await page.getByLabel('Password').fill(ACCOUNT.password)
  await page.getByRole('button', {name: 'Sign in'}).click()
  await expect(page.getByTestId('note-row').first()).toBeVisible({timeout: 20_000})
}

const editor = (page: Page, id: string) => page.locator(`main.editor[data-note-id="${id}"]`)
const row = (page: Page, id: string) => page.locator(`[data-testid=note-row][data-note-id="${id}"]`)
const block = (page: Page, id: string) => page.getByTestId('canvas').locator(`[data-bp-id="${id}"]`)

export async function open(page: Page, id: string) {
  if (!(await editor(page, id).count())) await row(page, id).click()
  await expect(editor(page, id).getByTestId('canvas').locator('[contenteditable="true"]')).toBeAttached()
}

type Pick = 'all' | 'end' | 'joinBack'

type Pm = {
  state: {doc: {forEach: (f: (n: {attrs: {bpId?: string}; nodeSize: number}, at: number) => void) => void; resolve: (p: number) => unknown}; selection: {constructor: {findFrom: (at: unknown, dir: number, text: boolean) => {from: number} | null}}}
  commands: {setTextSelection: (r: {from: number; to: number}) => boolean}
  view: {focus: () => void}
}

async function select(page: Page, id: string, how: Pick) {
  await block(page, id).evaluate((el, [id, how]) => {
    const ed = (el.closest('[contenteditable="true"]') as unknown as {editor?: Pm}).editor
    if (!ed) throw new Error('the canvas exposes no editor')
    let start = -1
    let size = 0
    ed.state.doc.forEach((n, at) => n.attrs.bpId === id && ((start = at), (size = n.nodeSize)))
    const end = start + size - 1
    const back = how === 'joinBack' ? ed.state.selection.constructor.findFrom(ed.state.doc.resolve(start), -1, true)?.from : undefined
    const from = how === 'all' ? start + 1 : how === 'end' ? end : back!
    ed.view.focus()
    if (!ed.commands.setTextSelection({from, to: end})) throw new Error(`could not select ${id}`)
  }, [id, how] as const)
}

async function link(page: Page, id: string, target: string): Promise<Block> {
  await select(page, id, 'end')
  await block(page, id).evaluate((el, target) => {
    const ed = (el.closest('[contenteditable="true"]') as unknown as {editor?: {chain: () => {focus: () => {insertContent: (c: unknown) => {run: () => boolean}}}}}).editor!
    ed.chain().focus().insertContent([{type: 'text', text: target, marks: [{type: 'wikilink', attrs: {target, docId: target}}]}, {type: 'text', text: ' '}]).run()
  }, target)
  const saved = () => page.getByTestId('canvas').evaluate((el, [id, target]) => (el as unknown as {blocks: Block[]}).blocks.find((b) => b.id === id && JSON.stringify(b).includes(`"docId":"${target}"`)), [id, target] as const)
  await expect.poll(saved).toBeTruthy()
  return (await saved())!
}

async function replace(page: Page, id: string, text: string) {
  await select(page, id, 'all')
  await page.keyboard.insertText(text)
  await expect(block(page, id)).toHaveText(text)
}

async function addAfterLast(page: Page, text: string): Promise<string> {
  const last = await page.getByTestId('canvas').locator(':is(p, h1, h2, h3, h4)[data-bp-id]').last().getAttribute('data-bp-id')
  await select(page, last!, 'end')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText(text)
  const canvas = page.getByTestId('canvas')
  const savedId = () => canvas.evaluate((el, text) => (el as unknown as {blocks: {id: string; content?: {value?: string}[]}[]}).blocks.find((b) => b.content?.map((c) => c.value ?? '').join('') === text)?.id, text)
  await expect.poll(savedId).toBeTruthy()
  const id = (await savedId())!
  expect(id).not.toBe(last)
  await expect(block(page, id)).toHaveText(text)
  return id
}

export async function act(page: Page, writer: Writer, op: Op) {
  const made: Made = {}
  if (op.kind === 'create') {
    const before = page.url()
    await page.getByTestId('new-note').first().click()
    await expect(page).not.toHaveURL(before)
    made.note = new URL(page.url()).searchParams.get('n')!
    expect(made.note).toMatch(/^note-/)
    await open(page, made.note)
    await page.getByTestId('title').fill(op.title)
    made.block = `${made.note}-p0`
    await replace(page, made.block, op.text)
  } else {
    await open(page, op.note)
    if (op.kind === 'type') await replace(page, op.block, op.text)
    if (op.kind === 'title') await page.getByTestId('title').fill(op.text)
    if (op.kind === 'add') made.block = await addAfterLast(page, op.text)
    if (op.kind === 'link') made.linked = await link(page, op.block, op.target)
    if (op.kind === 'drop') {
      await select(page, op.block, 'joinBack')
      await page.keyboard.press('Backspace')
      await expect(block(page, op.block)).toHaveCount(0)
    }
    if (op.kind === 'delete') {
      await page.getByTestId('delete-note').click()
      await expect(row(page, op.note)).toHaveCount(0)
    }
  }
  writer.done(op, made)
}
