// Spike C tests. Usage: node catchup.mjs <online|offline N|limit|garbage|shed|order|all>
// Each test prints one JSON result line and appends it to results.jsonl.
import { appendFileSync } from 'node:fs'
import { listen, mutate, mutateChunked, fetchAll, fetchManifest, applyFrame, diff, stats, resetStats, TYPE, sleep } from './lib.mjs'

const RESULTS = new URL('./results.jsonl', import.meta.url)
const record = (r) => { const line = JSON.stringify({ at: new Date().toISOString(), ...r }); console.log(line); appendFileSync(RESULTS, line + '\n') }
const tag = () => Math.random().toString(36).slice(2, 7)

// A device: replica + stream + cursor (max applied eventId).
function device(name) {
  const replica = new Map()
  const d = { name, replica, cursor: null, frames: [], unknown: [], dupes: 0, outOfOrder: 0, stream: null, events: [] }
  d.connect = (lastEventId = d.cursor) => {
    d.stream = listen({
      lastEventId,
      onFrame: (f) => {
        d.events.push({ event: f.event, t: performance.now(), data: f.json })
        if (f.event !== 'mutation') return
        const id = Number(f.json.eventId)
        if (d.cursor != null && id <= d.cursor) { d.dupes++; return } // replay/live overlap
        if (d.frames.length && id < d.frames[d.frames.length - 1]) d.outOfOrder++
        d.frames.push(id)
        if (!applyFrame(d.replica, f.json)) d.unknown.push(f.json.mutation)
        d.cursor = id
      },
    })
    return d.stream
  }
  return d
}

const waitFor = async (pred, ms = 60000, step = 50) => {
  const t0 = performance.now()
  while (!pred()) { if (performance.now() - t0 > ms) return false; await sleep(step) }
  return true
}
const welcomed = (d) => waitFor(() => d.events.some((e) => e.event === 'welcome'), 15000)

// Bootstrap: open the stream, then snapshot (no writes in between in these tests).
async function bootstrap(d) {
  d.connect(null)
  await welcomed(d)
  for (const [id, doc] of await fetchAll()) d.replica.set(id, doc)
  // Give the device a cursor: one write it will see live.
  const id = `warm-${tag()}`
  await mutate([{ create: { _type: TYPE, _id: id, title: 'warm', n: 0 } }])
  await waitFor(() => d.replica.has(`drafts.${id}`), 15000)
}

// ---- 1. online: every mutation kind applied live ----
async function online() {
  const d = device('online')
  await bootstrap(d)
  const a = `on-a-${tag()}`, b = `on-b-${tag()}`, c = `on-c-${tag()}`
  const steps = [
    [{ create: { _type: TYPE, _id: a, title: 'A', n: 1 } }, { create: { _type: TYPE, _id: b, title: 'B', n: 1 } }, { create: { _type: TYPE, _id: c, title: 'C', n: 1 } }],
    [{ patch: { id: `drafts.${a}`, type: TYPE, set: { n: 2, title: 'A2' } } }],
    [{ publish: { id: a, type: TYPE } }, { publish: { id: b, type: TYPE } }],
    [{ patch: { id: a, type: TYPE, set: { n: 3 } } }], // forks a draft over published A
    [{ unpublish: { id: b, type: TYPE } }],
    [{ discardDraft: { id: a, type: TYPE } }],
    [{ delete: { id: c, type: TYPE } }],
    [{ createOrReplace: { _type: TYPE, _id: `drafts.${c}`, title: 'C again', n: 9 } }],
    [{ publish: { id: c, type: TYPE } }],
  ]
  resetStats()
  for (const s of steps) await mutate(s)
  await sleep(2500)
  const truth = await fetchAll()
  const r = diff(d.replica, truth)
  d.stream.close()
  record({ test: 'online', mutations: steps.flat().length, frames: d.frames.length, unknownKinds: d.unknown, dupes: d.dupes, outOfOrder: d.outOfOrder, replicaCorrect: r.ok, diff: r, docs: truth.size })
}

// N offline changes: ~40% creates, 30% edits, 10% publishes, 20% deletes (of existing docs).
async function offline(N) {
  const d = device(`offline-${N}`)
  await bootstrap(d)
  // A second device stays online the whole time: it tells us the head event id.
  const obs = device('observer')
  obs.connect(d.cursor)
  await welcomed(obs)

  const cursorAtDisconnect = d.cursor
  d.stream.close()
  await d.stream.done.catch(() => {})

  const existing = [...d.replica.values()].filter((x) => x._draft).map((x) => x._publishedId)
  const t = tag()
  const nCreate = Math.round(N * 0.4), nEdit = Math.round(N * 0.3), nPub = Math.round(N * 0.1)
  const nDel = N - nCreate - nEdit - nPub
  const created = Array.from({ length: nCreate }, (_, i) => `off${N}-${t}-${i}`)
  const pool = [...created, ...existing]
  const muts = []
  for (const id of created) muts.push({ create: { _type: TYPE, _id: id, title: `c ${id}`, n: 1 } })
  for (let i = 0; i < nEdit; i++) muts.push({ patch: { id: `drafts.${created[i % created.length]}`, type: TYPE, set: { n: 100 + i, title: `e${i}` } } })
  const pubIds = created.slice(-nPub - nDel, -nDel || undefined).slice(0, nPub)
  for (const id of pubIds) muts.push({ publish: { id, type: TYPE } })
  // delete: prefer old docs (exercises tombstones for docs the device had), then fresh ones
  const delIds = [...existing.slice(0, Math.floor(nDel / 2)), ...created.slice(0, nDel)].slice(0, nDel)
  for (const id of delIds) muts.push({ delete: { id, type: TYPE } })

  const tw = performance.now()
  // phases must stay ordered (create before edit…): chunk within each phase
  const phases = [muts.filter((m) => m.create), muts.filter((m) => m.patch), muts.filter((m) => m.publish), muts.filter((m) => m.delete)]
  resetStats()
  for (const p of phases) await mutateChunked(p, 100)
  const writeRequests = stats.requests, writeMs = performance.now() - tw
  // head = last event the observer sees
  const expectedFrames = muts.length
  await waitFor(() => obs.frames.length >= expectedFrames, 120000)
  await sleep(1500)
  const head = obs.cursor
  obs.stream.close()

  // ---- reconnect with Last-Event-ID ----
  resetStats()
  const before = d.frames.length
  const t0 = performance.now()
  d.connect(cursorAtDisconnect)
  await waitFor(() => d.cursor >= head, 120000, 5)
  const toHead = performance.now() - t0
  // A real client has no "replay done" frame: measure the quiet-gap heuristic too.
  let lastT = performance.now()
  const seen = () => d.events.length
  let n0 = seen()
  await waitFor(() => { if (seen() !== n0) { n0 = seen(); lastT = performance.now() } return performance.now() - lastT > 1000 }, 30000, 20)
  const catchupRequests = stats.requests
  const truth = await fetchAll()
  const r = diff(d.replica, truth)
  d.stream.close()
  record({
    test: 'offline', N, mutationsWritten: muts.length, writeRequests, writeMs: Math.round(writeMs),
    observerFrames: obs.frames.length, replayedFrames: d.frames.length - before, dupes: d.dupes, outOfOrder: d.outOfOrder,
    unknownKinds: [...new Set(d.unknown)], catchupMsToHead: Math.round(toHead), catchupRequests,
    extraReadsNeeded: 0, replicaCorrect: r.ok, diffCounts: { missing: r.missing.length, extra: r.extra.length, stale: r.stale.length }, diffSample: { missing: r.missing.slice(0, 3), extra: r.extra.slice(0, 3), stale: r.stale.slice(0, 3) }, docs: truth.size,
  })
}

// ---- 3. replay limit: resume from 0 (whole history of this scope) ----
async function limit() {
  const d = device('limit')
  resetStats()
  const t0 = performance.now()
  d.connect(0)
  let lastT = performance.now(), n0 = 0
  await waitFor(() => { if (d.events.length !== n0) { n0 = d.events.length; lastT = performance.now() } return d.events.length > 1 && performance.now() - lastT > 3000 }, 300000, 20)
  const ms = performance.now() - lastT + (lastT - t0) - 3000
  const truth = await fetchAll()
  const r = diff(d.replica, truth)
  d.stream.close()
  record({ test: 'limit-from-0', replayedFrames: d.frames.length, firstEventId: d.frames[0], lastEventId: d.cursor, ms: Math.round(ms), requests: 1, replicaFromReplayAloneCorrect: r.ok, diffCounts: { missing: r.missing.length, extra: r.extra.length, stale: r.stale.length }, docs: truth.size, unknownKinds: [...new Set(d.unknown)] })
}

// ---- 3b. bad cursors: what does the server do? ----
async function garbage() {
  const out = {}
  for (const [label, cur] of [['future', '999999999999'], ['garbage', 'abc'], ['negative', '-5'], ['zero', '0']]) {
    const d = device(label)
    d.connect(cur)
    await sleep(4000)
    out[label] = { events: d.events.map((e) => e.event).reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {}), closedBy: d.stream.state.closedBy }
    d.stream.close()
  }
  record({ test: 'bad-cursors', out })
}

// ---- shed: a consumer that stops reading while >500 events arrive ----
const SHED_N = Number(process.env.SHED_N || 800), SHED_BYTES = Number(process.env.SHED_BYTES || 4000)
async function shed() {
  const { SERVER } = await import('./lib.mjs')
  const d = device('shed')
  await bootstrap(d)
  const cursor = d.cursor
  d.stream.close()
  // raw stream we deliberately do not read
  const { readFileSync } = await import('node:fs'); const { homedir } = await import('node:os')
  const token = JSON.parse(readFileSync(`${homedir()}/.config/barkpark/config.json`, 'utf8')).token
  const res = await fetch(`${SERVER}/w/barkever/p/default/v1/data/listen/spike-sync-c`, { headers: { authorization: `Bearer ${token}`, 'last-event-id': String(cursor) } })
  const reader = res.body.getReader()
  await reader.read() // welcome
  const t = tag()
  const muts = Array.from({ length: SHED_N }, (_, i) => ({ create: { _type: TYPE, _id: `shed-${t}-${i}`, title: 'shed', body: 'x'.repeat(SHED_BYTES), n: i } }))
  await mutateChunked(muts, 50)
  await sleep(5000)
  // now read everything that is left
  const dec = new TextDecoder(); let text = '', closed = false
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const r = await Promise.race([reader.read(), sleep(3000).then(() => 'idle')])
    if (r === 'idle') break
    if (r.done) { closed = true; break }
    text += dec.decode(r.value, { stream: true })
  }
  const mutationFrames = (text.match(/event: mutation/g) || []).length
  const overloaded = text.includes('event: overloaded')
  reader.cancel().catch(() => {})
  // recover with Last-Event-ID from the last id we got
  const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]))
  const resumeFrom = ids.length ? Math.max(...ids) : cursor
  const d2 = device('shed-recover'); d2.replica = d.replica
  for (const [k, v] of d.replica) d2.replica.set(k, v)
  d2.cursor = resumeFrom
  // apply what the stalled stream did deliver
  for (const block of text.split('\n\n')) { const m = block.match(/^data: (.*)$/m); if (block.includes('event: mutation') && m) applyFrame(d2.replica, JSON.parse(m[1])) }
  d2.connect(resumeFrom)
  await sleep(8000)
  const truth = await fetchAll()
  const r = diff(d2.replica, truth)
  d2.stream.close()
  record({ test: 'shed', written: SHED_N, bytesEach: SHED_BYTES, deliveredBeforeClose: mutationFrames, overloadedFrame: overloaded, serverClosed: closed, recoveredFrames: d2.frames.length, replicaCorrectAfterResume: r.ok, diffCounts: { missing: r.missing.length, extra: r.extra.length, stale: r.stale.length } })
}

// ---- order: concurrent writers — do live ids arrive in id order? ----
async function order() {
  const d = device('order')
  await bootstrap(d)
  const ids = []
  const watch = listen({ lastEventId: d.cursor, onFrame: (f) => { if (f.event === 'mutation') ids.push(Number(f.json.eventId)) } })
  await sleep(1000)
  const t = tag()
  const batch = (k) => Array.from({ length: 100 }, (_, i) => ({ create: { _type: TYPE, _id: `ord-${t}-${k}-${i}`, title: 'o', n: i } }))
  await Promise.all([mutate(batch(0)), mutate(batch(1)), mutate(batch(2))])
  await sleep(4000)
  watch.close()
  let inversions = 0
  for (let i = 1; i < ids.length; i++) if (ids[i] < ids[i - 1]) inversions++
  const truth = await fetchAll()
  const r = diff(d.replica, truth)
  d.stream.close()
  record({ test: 'order-concurrent-writers', frames: ids.length, liveIdInversions: inversions, deviceSkippedAsDupes: d.dupes, deviceReplicaCorrect: r.ok, diffCounts: { missing: r.missing.length, extra: r.extra.length, stale: r.stale.length } })
}

// ---- inflight: disconnect right after a fast write that committed before a slow,
// earlier-started one. Resume from the max id seen. Does replay deliver the slow batch?
// policy "naive": Last-Event-ID = max id seen.
// policy "rewind": Last-Event-ID = max id seen - REWIND, dedupe by a Set of seen ids.
async function inflight(policy = 'naive', REWIND = 100000) {
  const d = device(`inflight-${policy}`)
  await bootstrap(d)
  const seen = new Set(d.frames)
  const t = tag()
  const fastId = `fast-${t}`
  let cut = null
  // re-wire: close the stream the moment the fast doc's frame lands
  d.stream.close(); await d.stream.done.catch(() => {})
  const s = listen({ lastEventId: d.cursor, onFrame: (f) => {
    if (f.event !== 'mutation' || cut) return
    const id = Number(f.json.eventId); seen.add(id); applyFrame(d.replica, f.json); d.cursor = Math.max(d.cursor, id)
    if (f.json.documentId === `drafts.${fastId}`) { cut = d.cursor; s.close() }
  } })
  await sleep(1000)
  const slow = mutate(Array.from({ length: 300 }, (_, i) => ({ create: { _type: TYPE, _id: `slow-${t}-${i}`, title: 'slow '.repeat(50), n: i } })))
  await sleep(120)
  await mutate([{ create: { _type: TYPE, _id: fastId, title: 'fast', n: 1 } }])
  await slow
  await waitFor(() => cut != null, 15000)
  const sawSlowBeforeCut = [...d.replica.keys()].filter((k) => k.includes(`slow-${t}`)).length
  // reconnect
  const resumeFrom = policy === 'rewind' ? d.cursor - REWIND : d.cursor
  let replayed = 0, skipped = 0
  const s2 = listen({ lastEventId: resumeFrom, onFrame: (f) => {
    if (f.event !== 'mutation') return
    const id = Number(f.json.eventId)
    if (seen.has(id)) { skipped++; return }
    seen.add(id); replayed++; applyFrame(d.replica, f.json); d.cursor = Math.max(d.cursor, id)
  } })
  await sleep(5000)
  s2.close()
  const truth = await fetchAll()
  const r = diff(d.replica, truth)
  record({ test: 'inflight-commit-order', policy, rewindIds: policy === 'rewind' ? REWIND : 0, slowDocsSeenBeforeCut: sawSlowBeforeCut, replayedAfterResume: replayed, skippedAsSeen: skipped, replicaCorrect: r.ok, diffCounts: { missing: r.missing.length, extra: r.extra.length, stale: r.stale.length }, missingSample: r.missing.slice(0, 2) })
  d.stream?.close()
}

// ---- manifest: cost of the only gap check a client can run (server sends no gap signal) ----
async function manifest() {
  resetStats(); let t = performance.now(); const m = await fetchManifest(); const manifestMs = performance.now() - t, manifestRequests = stats.requests
  resetStats(); t = performance.now(); const a = await fetchAll(); const fullMs = performance.now() - t
  let same = 0; for (const [id, d] of a) if (m.get(id) === d._rev) same++
  record({ test: 'manifest-gap-check', docs: m.size, manifestMs: Math.round(manifestMs), manifestRequests, fullFetchMs: Math.round(fullMs), fullFetchRequests: stats.requests, revsAgree: same === a.size })
}

const [cmd, arg] = process.argv.slice(2)
const run = { online, offline: () => offline(Number(arg)), limit, garbage, shed, order, inflight: () => inflight(arg || 'naive'), manifest }[cmd]
if (!run) { console.error('usage: node catchup.mjs <online|offline N|limit|garbage|shed|order|inflight naive|rewind|manifest>'); process.exit(2) }
await run()
process.exit(0)
