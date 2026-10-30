import {expect, test, type Page} from '@playwright/test'
import {barkpark, DATASET, deleteNotes, serverNoteIds} from './fixtures-cleanup'
import {serverNote, status, synced} from './devices'

test.describe.configure({mode: 'serial', timeout: 180_000})
const created: string[] = []
test.afterAll(() => deleteNotes(created))

type Shape = {name: string; sign: string; blocks: (id: string) => unknown[]; typed?: true}
const SHAPES: Shape[] = [
  {name: 'only bold text', sign: '"strong"', blocks: (id) => [{id: `${id}-p0`, type: 'paragraph', content: [{type: 'strong', children: [{type: 'text', value: 'Buy rope'}]}]}], typed: true},
  {name: 'only an image', sign: '"image"', blocks: (id) => [{id: `${id}-i`, type: 'image', caption: ''}]},
  {name: 'only a link with no children', sign: '"pier-walk"', blocks: (id) => [{id: `${id}-p0`, type: 'paragraph', content: [{type: 'wikilink', docId: 'pier-walk'}]}]},
]

const rowOf = (page: Page, id: string) => page.locator(`[data-testid="note-row"][data-note-id="${id}"]`)

async function capture(page: Page) {
  await expect(page.getByTestId('new-note')).toBeEnabled()
  await page.keyboard.press('n')
  await expect(page.getByTestId('title')).toBeFocused()
  const id = new URL(page.url()).searchParams.get('n')!
  created.push(id)
  await expect(page.getByTestId('canvas').locator('[contenteditable="true"]')).toBeAttached()
  return id
}

async function hold(page: Page, id: string, shape: Shape) {
  if (shape.typed) {
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+b')
    await page.keyboard.type('Buy rope')
    await page.keyboard.press('ControlOrMeta+b')
    await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  } else {
    await page.evaluate(
      async ({id, blocks}) => {
        const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
        const db = await new Promise<IDBDatabase>((ok) => (indexedDB.open(name).onsuccess = (e) => ok((e.target as IDBOpenDBRequest).result)))
        const tx = db.transaction(['notes', 'outbox'], 'readwrite')
        const notes = tx.objectStore('notes')
        notes.get(id).onsuccess = (e) => {
          const note = (e.target as IDBRequest).result
          notes.put({...note, body: {...note.body, blocks}, _gen: (note._gen ?? 0) + 1})
          tx.objectStore('outbox').put({id, base: null, v: 1, at: Date.now()})
        }
        await new Promise((ok) => (tx.oncomplete = ok))
        db.close()
      },
      {id, blocks: shape.blocks(id)},
    )
    await page.reload()
    await expect(page.getByTestId('title')).toHaveValue('')
  }
  await expect.poll(serverNoteIds, {timeout: 15_000, message: shape.name}).toContain(id)
  await synced(page)
}

const stored = (page: Page, store: 'notes' | 'outbox', id: string) =>
  page.evaluate(
    async ({store, id}) => {
      const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
      const db = await new Promise<IDBDatabase>((ok) => (indexedDB.open(name).onsuccess = (e) => ok((e.target as IDBOpenDBRequest).result)))
      const found = await new Promise<{delete?: true} | undefined>((ok) => (db.transaction(store).objectStore(store).get(id).onsuccess = (e) => ok((e.target as IDBRequest).result)))
      db.close()
      return found
    },
    {store, id},
  )

const queued = async (page: Page, id: string) => !!(await stored(page, 'outbox', id))?.delete

async function stays(page: Page, id: string, shape: Shape) {
  await expect(rowOf(page, id), shape.name).toHaveCount(1)
  expect(await queued(page, id), shape.name).toBe(false)
  await page.reload()
  await expect(rowOf(page, id), `${shape.name}, after the app-start sweep`).toHaveCount(1, {timeout: 30_000})
  expect(await stored(page, 'notes', id), shape.name).toBeTruthy()
  await synced(page)
  expect(JSON.stringify((await serverNote(id))?.body?.blocks), shape.name).toContain(shape.sign)
}

test('blank-structure: leaving a note I made, online, keeps it when it holds only bold text, an image or a childless link', async ({page}) => {
  await page.goto('/')
  for (const shape of SHAPES) {
    const id = await capture(page)
    await hold(page, id, shape)
    await page.goBack()
    await synced(page)
    await stays(page, id, shape)
  }
})

test('blank-structure: leaving it offline queues no delete, and after reconnecting it is still here', async ({page, context}) => {
  await page.goto('/')
  for (const shape of SHAPES) {
    const id = await capture(page)
    await hold(page, id, shape)
    await context.setOffline(true)
    await page.goBack()
    await expect(page.getByTestId('sync-status')).toHaveText('Offline')
    await expect(rowOf(page, id), shape.name).toHaveCount(1)
    expect(await queued(page, id), shape.name).toBe(false)
    await context.setOffline(false)
    await synced(page)
    await stays(page, id, shape)
  }
})

test('blank-structure: the app-start sweep keeps a note I made that holds only bold text, an image or a childless link', async ({page}) => {
  await page.goto('/')
  for (const shape of SHAPES) {
    const id = await capture(page)
    await hold(page, id, shape)
    await page.goto('/')
    await expect(page.getByTestId('new-note')).toBeEnabled()
    await synced(page)
    await stays(page, id, shape)
  }
})

test('blank-structure: a note I made that a raw write fills with only bold text, an image or a childless link stays when I leave it', async ({page}) => {
  await page.goto('/')
  for (const shape of SHAPES) {
    const id = await capture(page)
    await page.keyboard.type('x')
    await expect.poll(serverNoteIds, {timeout: 15_000}).toContain(id)
    await synced(page)
    const res = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{patch: {id, type: 'note', set: {title: '', body: {blocks: shape.blocks(id)}}}}]})})
    expect(res.ok, shape.name).toBe(true)
    await expect(page.getByTestId('title'), shape.name).toHaveValue('', {timeout: 15_000})
    await page.goBack()
    await synced(page)
    await stays(page, id, shape)
  }
})
