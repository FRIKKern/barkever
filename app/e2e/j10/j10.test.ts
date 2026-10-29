import {expect, test, type Page} from '@playwright/test'
import {same} from '../../src/replica/merge.ts'
import {blockText} from '../../src/lib/model.ts'
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
const CLIENT_WEIGHTS: Partial<Record<Kind, number>> = {type: 60, title: 8, add: 10, drop: 6, create: 8, delete: 3}

const fx = (from: number, to: number) => Array.from({length: to - from + 1}, (_, i) => `fx-note-${String(from + i).padStart(2, '0')}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

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
    why = a.outbox || b.outbox ? [`outbox ${a.outbox}/${b.outbox}`] : differences(a.docs, b.docs)
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

test('J10: an hour offline on two clients, reconnect, both replicas equal the server in under 10 s', async ({browser}, info) => {
  const dataset = j10Dataset()
  const seed = Number(process.env.J10_SEED ?? 1010)
  const start = drafts(fixtures())
  const A = new Writer('A', seed, start, fx(0, 29), CLIENT_WEIGHTS)
  const B = new Writer('B', seed + 1, start, fx(20, 49), CLIENT_WEIGHTS)
  const S = new Writer('S', seed + 2, start, fx(0, 49), {type: 50, title: 20, create: 15, delete: 15})
  for (const w of [A, B, S]) for (const id of [CONFLICT, EDIT_VS_DELETE, DELETE_VS_EDIT]) w.protect.add(id)

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
  const t = Date.now()
  await converge([pa, pb], 15_000)
  const onlineMs = Date.now() - t

  await Promise.all(contexts.map((c) => c.setOffline(true)))
  const firstBlock = (w: Writer, note: string) => w.editableBlocks(note)[0].id
  const clashBlock = firstBlock(S, CONFLICT)
  for (let m = 0; m < MINUTES; m++) {
    if (m === 10) await act(pa, A, {kind: 'type', note: EDIT_VS_DELETE, block: firstBlock(A, EDIT_VS_DELETE), text: `A kept this while it was deleted ${A.marker()}`})
    if (m === 12) await serverBurst(S, [{kind: 'type', note: DELETE_VS_EDIT, block: firstBlock(S, DELETE_VS_EDIT), text: `Server edited this before B deleted it ${S.marker()}`}])
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

  for (const [p, w] of [
    [pa, A],
    [pb, B],
  ] as const) {
    await expect.poll(async () => lost([w], (await readReplica(p)).docs), {message: `${w.name} replica holds every edit typed`, timeout: 5_000}).toEqual([])
    const r = await readReplica(p)
    expect(r.outbox, `${w.name} has offline edits queued`).toBeGreaterThan(0)
    expect(JSON.stringify([...r.docs.values()]), `${w.name} saw no server write while offline`).not.toContain('[S')
  }

  const t0 = Date.now()
  await Promise.all(contexts.map((c) => c.setOffline(false)))
  const server = await converge([pa, pb], 30_000)
  const convergeMs = Date.now() - t0

  const notes = [...server.values()].filter((d): d is Note => d._type === 'note')
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

  expect(lost([A, B, S], server), 'every edit survives in the note or a kept version').toEqual([])
  const clash = server.get(CONFLICT) as Note
  expect(clash.conflicts?.length).toBeGreaterThanOrEqual(2)
  expect(server.has(EDIT_VS_DELETE), 'an offline edit beats a remote delete').toBe(true)
  expect(server.has(DELETE_VS_EDIT), 'a remote edit beats an offline delete').toBe(true)

  await open(pa, CONFLICT)
  const view = pa.getByTestId('conflict')
  await expect(view).toBeVisible()
  await expect(view.getByTestId('conflict-other')).toHaveCount(clash.conflicts!.length)
  for (const say of ['Tuesday', 'Thursday', 'cancelled']) await expect(view).toContainText(say)
  await view.screenshot({path: process.env.J10_SHOT ?? info.outputPath('conflict.png')})

  expect(errors).toEqual([])
  expect(convergeMs, `reconnect to synced: ${convergeMs} ms`).toBeLessThan(BUDGET_MS)
  await Promise.all(contexts.map((c) => c.close()))
})
