import {expect, test, type Page} from '@playwright/test'
import {barkpark, DATASET, deleteNotes} from './fixtures-cleanup'
import {canvas, created, device, deviceOf, errorsOf, everything, leave, newNote, serverNote, status, synced, typeAtEndOf, type ServerNote} from './devices'
import {blockText} from '../src/lib/model.ts'
import {groups} from '../src/lib/versions.ts'
import {TYPING_MS} from '../src/lib/typing.ts'

test.afterAll(() => deleteNotes(created))

async function serverRows(id: string): Promise<string[]> {
  const res = await barkpark(`/v1/data/query/${DATASET}/note?perspective=raw&filter[_id][in]=${id},drafts.${id}`)
  return ((await res.json()) as {result: {documents: {_id: string}[]}}).result.documents.map((d) => d._id)
}

test('bug 1: a focused editor that never saw the merged text keeps every version when it types again', async ({browser, baseURL}) => {
  const a = await device(browser, baseURL!)
  const b = await device(browser, baseURL!)
  const errors = [...errorsOf(a), ...errorsOf(b)]
  const id = await newNote(a, `Focused overwrite ${Date.now()}`, 'Base.')
  await b.goto(`/?n=${id}`)
  await expect(canvas(b)).toContainText('Base.', {timeout: 15_000})

  await b.context().setOffline(true)
  await typeAtEndOf(b, 0, ' OFF-B.')
  await leave(b)
  await typeAtEndOf(a, 0, ' A-one.')
  await expect(status(a)).toHaveText('Saved', {timeout: 15_000})

  await b.context().setOffline(false)
  await synced(b)
  await expect.poll(async () => everything(await serverNote(id)), {timeout: 15_000}).toContain('OFF-B.')
  await a.waitForTimeout(500)
  await a.keyboard.type(' A-two.')
  await leave(a)
  await expect(status(a)).toHaveText('Saved', {timeout: 15_000})
  await synced(a)

  const note = await serverNote(id)
  for (const t of ['OFF-B.', 'A-one.', 'A-two.']) expect(everything(note), `${t} survives in the note or a kept version`).toContain(t)
  expect(errors).toEqual([])
  await Promise.all([a.context().close(), b.context().close()])
})

test('bug 3: a change that lands while the editor is still loading shows up, and the next edit keeps it', async ({browser, baseURL}) => {
  const one = await device(browser, baseURL!)
  const errors = errorsOf(one)
  const id = await newNote(one, `Loading race ${Date.now()}`, 'Base.')
  await leave(one)
  const two = await one.context().newPage()
  errors.push(...errorsOf(two))
  await two.route('**/editor-assets/**', async (r) => {
    await new Promise((ok) => setTimeout(ok, 2500))
    await r.continue()
  })
  await two.goto(`/?n=${id}`)
  await expect(two.getByTestId('title')).toHaveValue(/Loading race/)
  await typeAtEndOf(one, 0, ' From tab one.')
  await leave(one)
  await expect(status(one)).toHaveText('Saved', {timeout: 15_000})
  await expect(canvas(two).locator('[contenteditable="true"]')).toBeAttached({timeout: 15_000})
  await expect(canvas(two)).toContainText('From tab one.')
  await typeAtEndOf(two, 0, ' Tab two.')
  await leave(two)
  await expect(status(two)).toHaveText('Saved', {timeout: 15_000})
  await expect(canvas(one)).toContainText('Base. From tab one. Tab two.')
  await synced(one)
  expect(blockText((await serverNote(id))!.body!.blocks[0])).toBe('Base. From tab one. Tab two.')
  expect(errors).toEqual([])
  await one.context().close()
})

test('bug 2: a published note edited online deletes, both rows go, and Barkpark keeps no copy', async ({browser, baseURL}) => {
  const id = `e2e-published-${Date.now()}`
  created.push(id)
  const seed = await barkpark(`/v1/data/mutate/${DATASET}`, {
    method: 'POST',
    body: JSON.stringify({mutations: [{createOrReplace: {_id: id, _type: 'note', title: 'Published, then edited online', notebook: {_type: 'reference', _ref: 'fx-nb-inbox'}, tags: [], links: [], body: {blocks: [{id: `${id}-p0`, type: 'paragraph', content: [{type: 'text', value: 'Published.'}]}]}}}, {publish: {id, type: 'note'}}]}),
  })
  expect(seed.ok).toBe(true)
  const page = await device(browser, baseURL!)
  const errors = errorsOf(page)
  await page.goto(`/?n=${id}`)
  await expect(page.getByTestId('title')).toHaveValue('Published, then edited online', {timeout: 15_000})
  await page.getByTestId('title').fill('Published, then edited online, now a draft too')
  await expect(status(page)).toHaveText('Saved', {timeout: 15_000})
  await expect.poll(async () => (await serverRows(id)).sort(), {timeout: 15_000}).toEqual([`drafts.${id}`, id])
  await synced(page)

  await page.getByTestId('delete-note').click()
  await expect(page.locator(`[data-testid=note-row][data-note-id="${id}"]`)).toHaveCount(0)
  await synced(page)
  await expect.poll(() => serverRows(id), {timeout: 10_000}).toEqual([])
  await expect(page.getByTestId('sync-stuck')).toHaveCount(0)
  expect(errors).toEqual([])
  await page.context().close()
})

test('bug 2: an entry Barkpark refuses never blocks the others, shows as stuck, logs, and retries with backoff', async ({browser, baseURL}) => {
  const page = await device(browser, baseURL!)
  const warnings: string[] = []
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()))
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible()
  const bad = `e2e-refused-${Date.now()}`
  await page.evaluate(async (bad) => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open(name)
      r.onsuccess = () => ok(r.result)
    })
    const tx = db.transaction(['notes', 'rows', 'outbox'], 'readwrite')
    tx.objectStore('notes').put({_id: bad, _type: 'note', title: 'too long for Barkpark '.repeat(5000), notebook: {_type: 'reference', _ref: 'fx-nb-inbox'}, tags: [], links: [], body: {blocks: []}})
    tx.objectStore('rows').put({id: bad})
    tx.objectStore('outbox').put({id: bad, base: null, v: 1, at: Date.now()})
    await new Promise((ok) => (tx.oncomplete = ok))
    db.close()
  }, bad)
  const good = await newNote(page, `Lands beside a refused one ${Date.now()}`, 'Good.')
  await expect.poll(async () => blockText((await serverNote(good))?.body?.blocks[0] ?? {id: '', type: 'paragraph'}), {timeout: 15_000}).toBe('Good.')
  await expect(page.getByTestId('sync-stuck')).toContainText('1 not accepted')
  await expect(page.getByTestId('sync-stuck')).toHaveAttribute('title', new RegExp(`${bad}: 422`))
  await expect.poll(() => warnings.filter((w) => w.includes(bad)).length, {timeout: 15_000}).toBeGreaterThanOrEqual(2)
  expect(warnings.find((w) => w.includes(bad))).toMatch(/did not reach Barkpark \(422 validation_failed\); attempt 1, next in 2 s/)
  expect(await serverNote(bad)).toBeUndefined()
  await page.context().close()
})

test('a note Barkpark refuses as too large is named in the sidebar and opens from there', async ({browser, baseURL}, testInfo) => {
  const page = await device(browser, baseURL!)
  await page.goto('/')
  await expect(page.getByTestId('note-row').first()).toBeVisible()
  const big = `e2e-too-big-${Date.now()}`
  const title = `Stormy note ${big}`
  await page.evaluate(
    async ({big, title}) => {
      const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
      const db = await new Promise<IDBDatabase>((ok) => {
        const r = indexedDB.open(name)
        r.onsuccess = () => ok(r.result)
      })
      const tx = db.transaction(['notes', 'rows', 'outbox'], 'readwrite')
      const words = Array.from({length: 150_000}, (_, i) => `stormcopy${i.toString(36)}`).join(' ')
      tx.objectStore('notes').put({_id: big, _type: 'note', title, notebook: {_type: 'reference', _ref: 'fx-nb-inbox'}, tags: [], links: [], body: {blocks: [{id: 'p', type: 'paragraph', content: [{type: 'text', value: words}]}]}})
      tx.objectStore('rows').put({id: big})
      tx.objectStore('outbox').put({id: big, base: null, v: 1, at: Date.now()})
      await new Promise((ok) => (tx.oncomplete = ok))
      db.close()
    },
    {big, title},
  )
  await newNote(page, `Wakes the sender ${Date.now()}`, 'Good.')
  const line = page.getByTestId('sync-too-big')
  await expect(line, 'a real 422 from Barkpark').toHaveText(`Too many versions of “${title}” to sync. Resolve some to continue.`, {timeout: 30_000})
  await expect(page.getByTestId('sync-stuck')).toHaveCount(0)
  await page.screenshot({path: testInfo.outputPath('too-big-light.png')})
  await page.emulateMedia({colorScheme: 'dark'})
  await page.screenshot({path: testInfo.outputPath('too-big-dark.png')})
  await page.emulateMedia({colorScheme: 'light'})
  await line.click()
  await expect(page).toHaveURL(new RegExp(`n=${big}`))
  await expect(page.getByTestId('title')).toHaveValue(title)
  await page.context().close()
})

test('words left in the journal on a note deleted elsewhere come back at the next boot and reach Barkpark', async ({page}) => {
  const errors = errorsOf(page)
  const id = await newNote(page, `Deleted with failed words ${Date.now()}`, 'Before.')
  await synced(page)
  await deleteNotes([id])
  await expect.poll(() => serverRows(id), {timeout: 10_000}).toEqual([])
  await expect(page.getByTestId('note-row').filter({hasText: 'Deleted with failed words'})).toHaveCount(0, {timeout: 15_000})
  await page.evaluate(async (id) => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
    const block = (value: string) => [{id: 'p', type: 'paragraph', content: [{type: 'text', value}]}]
    localStorage.setItem(`${name}-journal`, JSON.stringify({[id]: {seq: 5, steps: [{seq: 5, base: block('Before.'), after: block('Failed words.')}]}}))
  }, id)
  await page.reload()
  await expect(page.getByTestId('note-row').filter({hasText: 'Failed words.'})).toHaveCount(1, {timeout: 15_000})
  await expect.poll(async () => blockText((await serverNote(id))?.body?.blocks[0] ?? {id: '', type: 'paragraph'}), {timeout: 15_000}).toBe('Failed words.')
  expect(errors).toEqual([])
})

test('an offline edit to a note deleted elsewhere is pushed at reconnect, before catch-up, and lands at once without a refusal', async ({page}) => {
  const warnings: string[] = []
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()))
  const errors = errorsOf(page)
  const id = await newNote(page, `Edited while deleted ${Date.now()}`, 'Before.')
  await synced(page)
  await page.context().setOffline(true)
  await typeAtEndOf(page, 0, ' Typed offline.')
  await leave(page)
  await deleteNotes([id])
  await expect.poll(() => serverRows(id), {timeout: 10_000}).toEqual([])
  const reconnect = page.waitForRequest((r) => r.url().includes('/api/listen'))
  await page.context().setOffline(false)
  await reconnect
  const t0 = Date.now()
  await expect.poll(async () => blockText((await serverNote(id))?.body?.blocks[0] ?? {id: '', type: 'paragraph'}), {timeout: 15_000, intervals: [50]}).toBe('Before. Typed offline.')
  const ms = Date.now() - t0
  expect(warnings.filter((w) => w.includes(id))).toEqual([])
  expect(ms, 'lands without a retry backoff once the stream reconnects').toBeLessThan(2000)
  await synced(page)
  await expect(page.getByTestId('sync-stuck')).toHaveCount(0)
  expect(errors).toEqual([])
})

test.describe('with the editor held back at the network', () => {
  test.use({serviceWorkers: 'block'})

  test('Enter in the title before the editor has loaded moves the cursor into the body once it loads', async ({page}) => {
    await page.route('**/editor-assets/**', async (r) => {
      await new Promise((ok) => setTimeout(ok, 1500))
      await r.continue()
    })
    await page.goto('/')
    await expect(page.getByTestId('new-note')).toBeEnabled()
    await page.keyboard.press('n')
    await expect(page.getByTestId('title')).toBeFocused()
    created.push(new URL(page.url()).searchParams.get('n')!)
    await page.keyboard.type('Enter early')
    await expect(canvas(page)).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(canvas(page).locator('[contenteditable="true"]')).toBeAttached({timeout: 10_000})
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-testid=canvas]'))).toBe(true)
  })
})

test('when no tab holds the sync lock, sync takes it back by itself and keeps saving', async ({page}) => {
  const id = await newNote(page, `Lock lost ${Date.now()}`, 'Before.')
  const lock = () => page.evaluate(async () => (await navigator.locks.query()).held?.find((l) => l.name?.endsWith('-sync'))?.name ?? null)
  const name = await lock()
  expect(name).toBeTruthy()
  await page.evaluate((name) => navigator.locks.request(name, {steal: true}, async () => {}), name!)
  await expect.poll(lock, {timeout: 10_000}).toBe(name)
  await typeAtEndOf(page, 0, ' After.')
  await leave(page)
  await expect.poll(async () => blockText((await serverNote(id))?.body?.blocks[0] ?? {id: '', type: 'paragraph'}), {timeout: 15_000}).toBe('Before. After.')
})

test('two devices typing in one block online keep every text, and show at most one version per device', async ({browser, baseURL}) => {
  test.setTimeout(90_000)
  const a = await device(browser, baseURL!)
  const b = await device(browser, baseURL!)
  const errors = [...errorsOf(a), ...errorsOf(b)]
  const id = await newNote(a, `Two typists ${Date.now()}`, 'Shared.')
  await b.goto(`/?n=${id}`)
  await expect(canvas(b)).toContainText('Shared.', {timeout: 15_000})
  await typeAtEndOf(a, 0, '')
  await typeAtEndOf(b, 0, '')
  const typist = (page: Page, who: string) => page.keyboard.type(Array.from({length: 8}, (_, i) => ` ${who}${i}`).join(''), {delay: 60})
  await Promise.all([typist(a, 'A'), typist(b, 'B')])
  await Promise.all([leave(a), leave(b)])
  await Promise.all([synced(a), synced(b)])
  await a.waitForTimeout(1500)
  await Promise.all([synced(a), synced(b)])
  const note = (await serverNote(id))!
  const devices = [await deviceOf(a), await deviceOf(b)]
  const copies = note.conflicts ?? []
  test.info().annotations.push({type: 'copies', description: `stored ${copies.length}, shown ${groups(copies).length}, ${JSON.stringify(note).length} bytes`})
  expect(groups(copies).length, 'one shown version per device at most').toBeLessThanOrEqual(2)
  expect(copies.every((c) => devices.includes(c.by)), 'each copy names one of the two devices').toBe(true)
  for (const t of ['A7', 'B7']) expect(everything(note), `${t} survives`).toContain(t)
  expect(errors).toEqual([])
  await Promise.all([a.context().close(), b.context().close()])
})

for (const [pace, letters] of [[60, 2], [300, 1]] as const)
  test(`a remote writer setting the title six times while I type it, a key every ${pace} ms, shows one version, its latest`, async ({browser, baseURL}) => {
    test.setTimeout(90_000)
    const a = await device(browser, baseURL!)
    const errors = errorsOf(a)
    const id = await newNote(a, `Title race ${Date.now()}`, 'Body.')
    const title = a.getByTestId('title')
    await title.focus()
    await title.press('End')
    const typing = title.pressSequentially(' L' + 'abcdefghijklmnopqrstuvwxyz'.repeat(letters), {delay: pace})
    for (let i = 1; i <= 6; i++) {
      await a.waitForTimeout(400)
      const res = await barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{patch: {id, type: 'note', set: {title: `Remote title ${i}`}}}]})})
      expect(res.ok).toBe(true)
    }
    await typing
    await leave(a)
    await synced(a)
    await a.waitForTimeout(1500)
    await synced(a)
    const note = (await serverNote(id))!
    expect(note.title).toMatch(/xyz$/)
    const copies = note.conflicts ?? []
    test.info().annotations.push({type: 'copies', description: `stored ${copies.length}, shown ${groups(copies).length}, ${JSON.stringify(note).length} bytes`})
    expect(everything(note), 'the remote writer’s latest title survives').toContain('Remote title 6')
    expect(groups(copies).length, `one shown version for one remote writer: ${JSON.stringify(copies.map((c) => [c.by, c.title]))}`).toBeLessThanOrEqual(1)
    expect(groups(copies)[0]?.latest.title, `the shown version is the remote writer’s latest: ${JSON.stringify({title: note.title, copies: copies.map((c) => [c.title, c.at, c._key])})}`).toBe('Remote title 6')
    expect(errors).toEqual([])
    await a.context().close()
  })

const holdReplica = (page: Page, ms: number) =>
  page.evaluate(async (ms) => {
    const name = (await indexedDB.databases()).map((d) => d.name).find((n) => n?.startsWith('barkever-'))!
    const db = await new Promise<IDBDatabase>((ok) => {
      const r = indexedDB.open(name)
      r.onsuccess = () => ok(r.result)
    })
    const tx = db.transaction(['notes', 'rows', 'outbox'], 'readwrite')
    const end = Date.now() + ms
    const spin = () => void (Date.now() < end && (tx.objectStore('notes').get('none').onsuccess = spin))
    spin()
    tx.oncomplete = () => db.close()
  }, ms)

const remoteTitle = (id: string, title: string) => barkpark(`/v1/data/mutate/${DATASET}`, {method: 'POST', body: JSON.stringify({mutations: [{patch: {id, type: 'note', set: {title}}}]})})

test('a remote title shows in an open editor whose title is focused but has no key pressed', async ({browser, baseURL}) => {
  const a = await device(browser, baseURL!)
  const errors = errorsOf(a)
  const stamp = Date.now()
  const id = await newNote(a, `Idle adopt ${stamp}`, 'Body.')
  await leave(a)
  await synced(a)
  await a.goto(`/?n=${id}`)
  const title = a.getByTestId('title')
  await expect(title).toHaveValue(`Idle adopt ${stamp}`)
  await title.focus()
  expect((await remoteTitle(id, `Remote while idle ${stamp}`)).ok).toBe(true)
  await expect(title).toHaveValue(`Remote while idle ${stamp}`, {timeout: 15_000})
  await expect(title).toBeFocused()
  expect(errors).toEqual([])
  await a.context().close()
})

test('a remote rename reaches the title box while only a body save is owed, and stays after that save heals', async ({browser, baseURL}) => {
  const a = await device(browser, baseURL!)
  await a.addInitScript(() => {
    const real = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof real>) {
      const req = real.apply(this, args)
      if ((window as unknown as {breakWrites?: boolean}).breakWrites && this.name === 'outbox') this.transaction!.abort()
      return req
    }
  })
  const stamp = Date.now()
  const id = await newNote(a, `Owed body ${stamp}`, 'Body.')
  await leave(a)
  await synced(a)
  await a.goto(`/?n=${id}`)
  const title = a.getByTestId('title')
  await expect(title).toHaveValue(`Owed body ${stamp}`)
  await a.getByTestId('canvas').locator('[contenteditable="true"]').first().click()
  await a.keyboard.press('End')
  const failed = a.waitForEvent('console', (m) => m.text().includes('a write failed'))
  await a.evaluate(() => ((window as unknown as {breakWrites?: boolean}).breakWrites = true))
  await a.keyboard.type(' failed')
  await failed
  await a.evaluate(() => ((window as unknown as {breakWrites?: boolean}).breakWrites = false))
  expect((await remoteTitle(id, `Renamed ${stamp}`)).ok).toBe(true)
  await expect(title).toHaveValue(`Renamed ${stamp}`, {timeout: 15_000})
  await a.keyboard.type(' healed')
  await expect.poll(async () => (await serverNote(id))?.body?.blocks.map(blockText).join(' '), {timeout: 15_000}).toContain('failed healed')
  await expect(status(a)).toHaveText('Saved', {timeout: 15_000})
  await expect(title).toHaveValue(`Renamed ${stamp}`)
  expect((await serverNote(id))?.title).toBe(`Renamed ${stamp}`)
  await a.context().close()
})

test('Keep this on a title version right after a title key shows the kept title before the typing pause ends, and it stays the main', async ({browser, baseURL}) => {
  const a = await device(browser, baseURL!)
  const errors = errorsOf(a)
  const stamp = Date.now()
  const id = await newNote(a, `Keep race ${stamp}`, 'Body.')
  await leave(a)
  await synced(a)
  const title = a.getByTestId('title')
  await a.context().setOffline(true)
  await title.fill(`Mine ${stamp}`)
  await leave(a)
  await expect(status(a)).toHaveText('Offline · saved on this device', {timeout: 15_000})
  const kept = `Theirs ${stamp}`
  expect((await remoteTitle(id, kept)).ok).toBe(true)
  await a.context().setOffline(false)
  await synced(a)
  const view = a.getByTestId('conflict')
  await expect(view.getByTestId('conflict-other')).toContainText(kept, {timeout: 15_000})
  if (!(await view.evaluate((d) => (d as HTMLDetailsElement).open))) await view.locator('summary').first().click()
  await title.focus()
  await title.press('End')
  await title.evaluate((el) => el.addEventListener('keydown', () => ((window as unknown as {keyAt: number}).keyAt = Date.now()), {once: true}))
  await title.press('X')
  await view.getByTestId('keep-version').first().click()
  const shown = await a.waitForFunction((t) => (document.querySelector('[data-testid="title"]') as HTMLTextAreaElement).value === t && [Date.now() - (window as unknown as {keyAt: number}).keyAt], kept, {polling: 'raf'})
  const [after] = (await shown.jsonValue()) as number[]
  test.info().annotations.push({type: 'kept title shown after the key', description: `${after} ms`})
  expect(after, 'the kept title shows before the typing pause ends').toBeLessThan(TYPING_MS)
  await a.waitForTimeout(TYPING_MS + 500)
  await expect(title).toHaveValue(kept)
  await leave(a)
  await synced(a)
  expect((await serverNote(id))!.title, 'the kept title is the main').toBe(kept)
  expect(errors).toEqual([])
  await a.context().close()
})

test('a title changed in another tab while this tab is mid-save is kept, and the title box shows what the replica holds', async ({browser, baseURL}) => {
  const one = await device(browser, baseURL!)
  const errors = errorsOf(one)
  const id = await newNote(one, 'Tab race', 'Body.')
  const two = await one.context().newPage()
  errors.push(...errorsOf(two))
  await two.goto(`/?n=${id}`)
  await expect(two.getByTestId('title')).toHaveValue('Tab race')
  await one.getByTestId('title').focus()
  await one.getByTestId('title').press('End')
  await holdReplica(one, 1500)
  await two.getByTestId('title').fill('Renamed in tab two')
  await one.keyboard.type('!')
  await expect(one.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
  await expect(two.getByTestId('save-status')).toHaveText('Saved', {timeout: 15_000})
  await synced(one)
  const note = (await serverNote(id))!
  expect(everything(note), 'the other tab’s title survives').toContain('Renamed in tab two')
  expect(everything(note)).toContain('Tab race!')
  await expect(one.getByTestId('title')).toHaveValue(note.title!)
  await expect(two.getByTestId('title')).toHaveValue(note.title!)
  expect(errors).toEqual([])
  await one.context().close()
})

for (const where of ['title', 'block'] as const) {
  test(`a ${where} clash: the device that lost types on the main, and its losing ${where} stays on the server and both devices`, async ({browser, baseURL}) => {
    test.setTimeout(90_000)
    const a = await device(browser, baseURL!)
    const b = await device(browser, baseURL!)
    const errors = [...errorsOf(a), ...errorsOf(b)]
    const stamp = Date.now()
    const id = await newNote(a, `Loser keeps ${stamp}`, 'Base.')
    await leave(a)
    await synced(a)
    await b.goto(`/?n=${id}`)
    await expect(canvas(b)).toContainText('Base.', {timeout: 15_000})

    const firstBlock = (page: Page) => canvas(page).locator('[contenteditable="true"] > [data-bp-id]').first()
    const mainOf = (n: ServerNote | undefined) => (where === 'title' ? n?.title : n?.body && blockText(n.body.blocks[0]))
    const saved = async (page: Page) => {
      await leave(page)
      await expect(status(page)).toHaveText(/^(Saved|Offline · saved on this device)$/, {timeout: 15_000})
    }
    const write = async (page: Page, text: string) => {
      if (where === 'title') await page.getByTestId('title').fill(text)
      else await typeAtEndOf(page, 0, ` ${text}`)
      await saved(page)
    }
    const typeOnMain = async (page: Page, text: string) => {
      if (where === 'title') {
        await page.getByTestId('title').focus()
        await page.getByTestId('title').press('End')
        await page.keyboard.type(text)
      } else await typeAtEndOf(page, 0, text)
      await saved(page)
    }

    await b.context().setOffline(true)
    await write(b, `B offline ${stamp}`)
    await write(a, `A online ${stamp}`)
    await synced(a)
    await b.context().setOffline(false)
    await synced(b)
    await expect.poll(async () => everything(await serverNote(id)), {timeout: 15_000}).toContain(`A online ${stamp}`)
    const won = mainOf(await serverNote(id))!
    expect(won, 'the offline device keeps the main').toContain(`B offline ${stamp}`)
    if (where === 'title') await expect(a.getByTestId('title')).toHaveValue(won, {timeout: 15_000})
    else await expect(firstBlock(a)).toHaveText(won, {timeout: 15_000})

    await typeOnMain(a, '!')
    await expect.poll(async () => mainOf(await serverNote(id)), {timeout: 15_000}).toBe(`${won}!`)
    await a.waitForTimeout(1500)
    await Promise.all([synced(a), synced(b)])

    expect(everything(await serverNote(id)), 'the losing text survives on the server').toContain(`A online ${stamp}`)
    for (const [page, label] of [
      [a, 'Your version'],
      [b, 'Other version'],
    ] as const) {
      const kept = page.getByTestId('conflict').getByTestId('conflict-other').filter({hasText: `A online ${stamp}`})
      await expect(kept, `the losing text survives on the device labelled “${label}”`).toHaveCount(1)
      await expect(kept).toContainText(label)
    }
    await a.getByTestId('conflict').screenshot({path: test.info().outputPath(`loser-${where}.png`)})
    expect(errors).toEqual([])
    await Promise.all([a.context().close(), b.context().close()])
  })
}
