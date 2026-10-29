import {expect, test, type Page} from '@playwright/test'
import {same} from '../../src/replica/merge.ts'
import {blockText, wikilinks} from '../../src/lib/model.ts'
import type {Doc, NoteDoc as Note} from '../../src/replica/note.ts'
import {act, open, readReplica, signIn} from './client.ts'
import {drafts, fixtures, j10Dataset, serverBurst, snapshot} from './server.ts'
import {Writer, type Kind} from './writer.ts'

const MINUTES = Number(process.env.J10_MINUTES ?? 60)
const OPS_PER_MINUTE = 5
const SERVER_EVERY = 6
const SERVER_OPS = 4
const BUDGET_MS = 10_000
const CONFLICT = 'fx-note-25'
const EDIT_VS_DELETE = 'fx-note-05'
const DELETE_VS_EDIT = 'fx-note-45'
const ECHO = 'fx-note-04'
const DELETED_ONLINE = 'fx-note-03'
const EDITED_ONLINE = {A: 'fx-note-02', B: 'fx-note-47'}
const LINKED = 'fx-note-21'
const TARGETS = ['fx-note-00', 'fx-note-49']
const FOCUS = 'fx-note-23'
const CLIENT_WEIGHTS: Partial<Record<Kind, number>> = {type: 60, title: 8, add: 10, drop: 6, create: 8, delete: 3}

const fx = (from: number, to: number) => Array.from({length: to - from + 1}, (_, i) => `fx-note-${String(from + i).padStart(2, '0')}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const notesOf = (docs: Map<string, Doc>) => [...docs.values()].filter((d): d is Note => d._type === 'note')

function differences(a: Map<string, Doc>, b: Map<string, Doc>): string[] {
  const out: string[] = []
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const [x, y] = [a.get(id), b.get(id)]
    if (!x || !y) out.push(`${id} only on ${x ? 'first' : 'second'}`)
    else if (x._rev !== y._rev) out.push(`${id} rev`)
    else if (!same(x, y)) out.push(`${id} content`)
  }
  return out
}

function survives(note: Doc | undefined, key: string, text: string): boolean {
  if (!note || note._type !== 'note') return false
  const versions = [{title: note.title, body: note.body}, ...(note.conflicts ?? [])]
  return versions.some((v) => (key === 'title' ? v.title === text : !!v.body?.blocks.some((b) => b.id === key && blockText(b) === text)))
}

const lost = (writers: Writer[], docs: Map<string, Doc>) =>
  writers.flatMap((w) => [...w.typed].flatMap(([note, keys]) => [...keys].filter(([key, text]) => !survives(docs.get(note), key, text)).map(([key]) => `${w.name} ${note}/${key}`)))

async function converge(pages: Page[], timeoutMs: number): Promise<Map<string, Doc>> {
  const end = Date.now() + timeoutMs
  let asked = 0
  let why: string[] = []
  for (;;) {
    const [a, b] = await Promise.all(pages.map(readReplica))
    why = a.outbox || b.outbox ? [`outbox ${a.waiting.join(' ') || 0} / ${b.waiting.join(' ') || 0}`] : differences(a.docs, b.docs)
    if (!why.length && Date.now() - asked > 1000) {
      asked = Date.now()
      const server = await snapshot()
      why = [...differences(a.docs, server), ...differences(b.docs, server)]
      if (!why.length) return server
    }
    if (Date.now() > end) throw new Error(`not converged: ${why.slice(0, 8).join(', ')}`)
    await sleep(100)
  }
}

async function typeTitleByHand(page: Page, w: Writer, note: string, text: string) {
  await open(page, note)
  await page.getByTestId('title').fill('')
  await page.getByTestId('title').pressSequentially(text, {delay: 60})
  w.done({kind: 'title', note, text})
}

test('J10: an hour offline on two clients, reconnect, both replicas equal the server in under 10 s', async ({browser}, info) => {
  const dataset = j10Dataset()
  const seed = Number(process.env.J10_SEED ?? 1010)
  const start = drafts(fixtures())
  const A = new Writer('A', seed, start, fx(0, 29), CLIENT_WEIGHTS)
  const B = new Writer('B', seed + 1, start, fx(20, 49), CLIENT_WEIGHTS)
  const S = new Writer('S', seed + 2, start, fx(0, 49), {type: 50, title: 20, create: 15, delete: 15})
  const writers = [A, B, S]
  for (const w of writers) for (const id of [CONFLICT, EDIT_VS_DELETE, DELETE_VS_EDIT, ...TARGETS]) w.protect.add(id)
  for (const w of writers) for (const id of [ECHO, DELETED_ONLINE, EDITED_ONLINE.A, EDITED_ONLINE.B, FOCUS, LINKED]) w.reserved.add(id)

  const errors: string[] = []
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({baseURL: info.project.use.baseURL, viewport: {width: 1440, height: 900}})))
  const [pa, pb] = await Promise.all(contexts.map((c) => c.newPage()))
  for (const p of [pa, pb]) p.on('pageerror', (e) => errors.push(e.message))
  await Promise.all(
    [pa, pb].map(async (p) => {
      await signIn(p)
      await expect(p.getByTestId('note-row')).toHaveCount(50, {timeout: 20_000})
      await open(p, 'fx-note-00')
    }),
  )

  await act(pa, A, {kind: 'title', note: 'fx-note-01', text: `Online from A ${A.marker()}`})
  await act(pb, B, {kind: 'title', note: 'fx-note-48', text: `Online from B ${B.marker()}`})
  await typeTitleByHand(pa, A, ECHO, `Typed by hand online ${A.marker()}`)
  await act(pa, A, {kind: 'type', note: ECHO, block: A.editableBlocks(ECHO)[0].id, text: A.textFor(ECHO, A.editableBlocks(ECHO)[0].id)})
  await act(pa, A, {kind: 'title', note: EDITED_ONLINE.A, text: `Edited online, deleted offline ${A.marker()}`})
  await act(pb, B, {kind: 'title', note: EDITED_ONLINE.B, text: `Edited online, deleted offline ${B.marker()}`})
  const editedOnline = `Edited online, deleted online ${A.marker()}`
  await act(pa, A, {kind: 'title', note: DELETED_ONLINE, text: editedOnline})
  await expect.poll(async () => ((await snapshot()).get(DELETED_ONLINE) as Note | undefined)?.title, {timeout: 15_000}).toBe(editedOnline)
  await act(pa, A, {kind: 'delete', note: DELETED_ONLINE})
  for (const w of [B, S]) w.notes.delete(DELETED_ONLINE)
  const t = Date.now()
  const online = await converge([pa, pb], 15_000)
  const onlineMs = Date.now() - t
  expect(online.has(DELETED_ONLINE), 'a note edited online then deleted online is gone').toBe(false)
  expect((online.get(ECHO) as Note).conflicts ?? [], 'one person typing online never conflicts with their own echo').toEqual([])
  expect(notesOf(online).filter((n) => n.conflicts?.length).map((n) => n._id), 'no conflict anywhere after online editing').toEqual([])

  await Promise.all(contexts.map((c) => c.setOffline(true)))
  const firstBlock = (w: Writer, note: string) => w.editableBlocks(note)[0].id
  const clashBlock = firstBlock(S, CONFLICT)
  const focusBlock = firstBlock(A, FOCUS)
  for (let m = 0; m < MINUTES; m++) {
    if (m === 5) {
      await act(pa, A, {kind: 'delete', note: EDITED_ONLINE.A})
      await act(pb, B, {kind: 'delete', note: EDITED_ONLINE.B})
    }
    if (m === 10) await act(pa, A, {kind: 'type', note: EDIT_VS_DELETE, block: firstBlock(A, EDIT_VS_DELETE), text: `A kept this while it was deleted ${A.marker()}`})
    if (m === 12) await serverBurst(S, [{kind: 'type', note: DELETE_VS_EDIT, block: firstBlock(S, DELETE_VS_EDIT), text: `Server edited this before B deleted it ${S.marker()}`}])
    if (m === 20) {
      await act(pa, A, {kind: 'link', note: LINKED, block: A.editableBlocks(LINKED).find((b) => b.type === 'paragraph')!.id, target: TARGETS[0]})
      await act(pb, B, {kind: 'add', note: LINKED, text: `B links from here ${B.marker()}`})
      await act(pb, B, {kind: 'link', note: LINKED, block: B.notes.get(LINKED)!.blocks.at(-1)!.id, target: TARGETS[1]})
    }
    if (m === 30) {
      await Promise.all([
        act(pa, A, {kind: 'type', note: CONFLICT, block: clashBlock, text: A.textFor(CONFLICT, clashBlock, 'A: the review moves to Tuesday')}),
        act(pb, B, {kind: 'type', note: CONFLICT, block: clashBlock, text: B.textFor(CONFLICT, clashBlock, 'B: the review moves to Thursday')}),
        serverBurst(S, [{kind: 'type', note: CONFLICT, block: clashBlock, text: S.textFor(CONFLICT, clashBlock, 'Server: the review is cancelled')}]),
      ])
    }
    if (m === 42) await serverBurst(S, [{kind: 'delete', note: EDIT_VS_DELETE}])
    if (m === 48) await act(pb, B, {kind: 'delete', note: DELETE_VS_EDIT})
    await Promise.all(
      [
        [pa, A],
        [pb, B],
      ].map(async ([p, w]) => {
        for (let i = 0; i < OPS_PER_MINUTE; i++) await act(p as Page, w as Writer, (w as Writer).next())
      }),
    )
    if (m % SERVER_EVERY === 3) await serverBurst(S, SERVER_OPS)
  }
  await act(pb, B, {kind: 'type', note: FOCUS, block: focusBlock, text: B.textFor(FOCUS, focusBlock, 'B typed this offline')})
  await act(pa, A, {kind: 'type', note: FOCUS, block: focusBlock, text: A.textFor(FOCUS, focusBlock, 'A typed this offline')})

  for (const [p, w] of [
    [pa, A],
    [pb, B],
  ] as const) {
    await expect.poll(async () => lost([w], (await readReplica(p)).docs), {message: `${w.name} replica holds every edit typed`, timeout: 5_000}).toEqual([])
    const r = await readReplica(p)
    expect(r.outbox, `${w.name} has offline edits queued`).toBeGreaterThan(0)
    expect(JSON.stringify([...r.docs.values()]), `${w.name} saw no server write while offline`).not.toContain('[S')
  }
  expect(await pa.evaluate(() => !!document.activeElement?.closest('[data-testid=canvas]')), 'A reconnects with the editor focused').toBe(true)

  const t0 = Date.now()
  await Promise.all(contexts.map((c) => c.setOffline(false)))
  await Promise.all([
    (async () => {
      await act(pa, A, {kind: 'type', note: FOCUS, block: focusBlock, text: A.textFor(FOCUS, focusBlock)})
      await sleep(1500)
      await act(pa, A, {kind: 'type', note: FOCUS, block: focusBlock, text: A.textFor(FOCUS, focusBlock)})
    })(),
    act(pb, B, B.next()),
  ])
  const server = await converge([pa, pb], 30_000)
  const convergeMs = Date.now() - t0

  const notes = notesOf(server)
  const summary = {
    dataset,
    seed,
    convergeMs,
    onlineMs,
    edits: {A: A.counts, B: B.counts, server: S.counts},
    notes: notes.length,
    notesWithConflicts: notes.filter((n) => n.conflicts?.length).length,
    otherVersions: notes.reduce((s, n) => s + (n.conflicts?.length ?? 0), 0),
  }
  console.log(`J10 ${JSON.stringify(summary)}`)
  await info.attach('j10-summary.json', {body: JSON.stringify(summary, null, 2), contentType: 'application/json'})

  const byOthers = (w: Writer, note: string, key?: string) => writers.some((o) => o !== w && (key ? o.touched.get(note)?.has(key) : o.touched.has(note)))
  const writersOf = (note: string) => writers.filter((w) => w.touched.has(note)).length
  const unDeleted = writers.flatMap((w) => w.deleted.filter((n) => !byOthers(w, n) && server.has(n)).map((n) => `${w.name} ${n}`))
  const sticks = (w: Writer, n: string, b: string) => !byOthers(w, n, b) && !w.deleted.includes(n)
  const unDropped = writers.flatMap((w) => w.dropped.filter(([n, b]) => sticks(w, n, b) && (server.get(n) as Note | undefined)?.body?.blocks.some((x) => x.id === b)).map(([n, b]) => `${w.name} ${n}/${b}`))
  const strict = {deletesThatShouldStick: writers.flatMap((w) => w.deleted.filter((n) => !byOthers(w, n))).length, dropsThatShouldStick: writers.flatMap((w) => w.dropped.filter(([n, b]) => sticks(w, n, b))).length}
  console.log(`J10 strict ${JSON.stringify({...strict, unDeleted, unDropped})}`)

  expect(lost(writers, server), 'every edit survives in the note or a kept version').toEqual([])
  expect(unDeleted, 'deletes nobody else touched are gone from the server').toEqual([])
  expect(unDropped, 'dropped blocks nobody else touched stay gone').toEqual([])
  expect(server.has(EDITED_ONLINE.A) || server.has(EDITED_ONLINE.B), 'notes edited online and deleted offline are gone').toBe(false)
  const clash = server.get(CONFLICT) as Note
  expect(clash.conflicts?.length).toBeGreaterThanOrEqual(2)
  expect(server.has(EDIT_VS_DELETE), 'an offline edit beats a remote delete').toBe(true)
  expect(server.has(DELETE_VS_EDIT), 'a remote edit beats an offline delete').toBe(true)

  const linked = server.get(LINKED) as Note
  expect(wikilinks(linked.body!.blocks).filter((l) => TARGETS.includes(l)).sort(), 'both offline links land in the body').toEqual(TARGETS)
  const badLinks = notes.filter((n) => !same([...(n.links ?? []).map((l) => l._ref)].sort(), wikilinks(n.body?.blocks ?? []).sort())).map((n) => n._id)
  expect(badLinks, 'links always match the wikilinks in the body').toEqual([])
  expect(notes.filter((n) => n.conflicts?.some((c) => c.clash.includes('links'))).map((n) => n._id), 'links never clash').toEqual([])
  const extraCopies = notes.filter((n) => n._id !== FOCUS && (n.conflicts?.length ?? 0) > writersOf(n._id) - 1).map((n) => `${n._id}: ${n.conflicts!.length} copies, ${writersOf(n._id)} writers`)
  expect(extraCopies, 'one kept version per other writer at most: no echo or replay copies').toEqual([])

  await open(pa, CONFLICT)
  const view = pa.getByTestId('conflict')
  await expect(view).toBeVisible()
  await expect(view.getByTestId('conflict-other')).toHaveCount(clash.conflicts!.length)
  for (const say of ['Tuesday', 'Thursday', 'cancelled']) await expect(view).toContainText(say)
  await view.screenshot({path: process.env.J10_SHOT ?? info.outputPath('conflict.png')})

  await expect(pa.getByTestId('sync-stuck')).toHaveCount(0)
  await expect(pb.getByTestId('sync-stuck')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(convergeMs, `reconnect to synced: ${convergeMs} ms`).toBeLessThan(BUDGET_MS)
  await Promise.all(contexts.map((c) => c.close()))
})
