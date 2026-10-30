import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {drop, dropEach, stale, sweep, toDrop, type Dropped, type Send} from './drop.ts'

type Call = {path: string; query: string; method: string; at: number}
type Reply = number | {status: number; reason?: string; code?: string; retryAfter?: number; id?: string | null; html?: boolean}

const RUN = 'ds-7f3a'

function reply(r: Reply, name: string) {
  const {status, reason, code = 'storage_unavailable', retryAfter, id = RUN, html} = typeof r === 'number' ? {status: r} : r
  const headers: Record<string, string> = {'content-type': 'application/json', ...(retryAfter && {'retry-after': String(retryAfter)})}
  if (html) return {status, headers, body: '<html>502 Bad Gateway</html>'}
  if (status === 200) return {status, headers, body: {deleted: true, documents: 3}}
  if (status === 202) return {status, headers, body: {deleting: true, dataset: name, ...(id && {dataset_id: id})}}
  return {status, headers, body: {error: {code, message: 'fake', ...(reason && {details: {reason}})}}}
}

async function fakeBarkpark(answers: Record<string, Reply[]>) {
  const calls: Call[] = []
  const left = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]))
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '', 'http://fake')
    calls.push({path: url.pathname, query: url.search, method: req.method ?? '', at: Date.now()})
    const name = url.pathname.split('/').pop()!
    const queue = left[name] ?? [404]
    const {status, headers, body} = reply(queue.length > 1 ? queue.shift()! : queue[0]!, name)
    res.writeHead(status, headers).end(typeof body === 'string' ? body : JSON.stringify(body))
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  server.unref()
  const {port} = server.address() as {port: number}
  const send: Send = (path, init) => fetch(`http://127.0.0.1:${port}${path}`, init)
  return {send, calls, close: () => server.close()}
}

const A = 'e2e-20261030080000-111'
const B = 'j10-20261030080000-222'

test('a 202 is "still deleting": the same DELETE goes again 2 s later until the 200, and only the 200 counts as dropped', async () => {
  const bp = await fakeBarkpark({[A]: [202, 202, 200]})
  const out = await drop(A, bp.send)
  bp.close()
  assert.deepEqual(out, {gone: true, said: `dropped ${A} (3 documents)`})
  assert.deepEqual(bp.calls.map((c) => [c.method, c.path]), Array(3).fill(['DELETE', `/v1/datasets/${A}`]))
  assert.deepEqual(bp.calls.map((c) => c.query), ['', `?dataset_id=${RUN}`, `?dataset_id=${RUN}`])
  for (let i = 1; i < bp.calls.length; i++) assert.ok(bp.calls[i]!.at - bp.calls[i - 1]!.at >= 1_900, `poll ${i} waited ${bp.calls[i]!.at - bp.calls[i - 1]!.at} ms`)
})

test('a 404, also on a poll naming the run (its dataset is gone, whatever now holds the name), means gone', async () => {
  const bp = await fakeBarkpark({[A]: [202, {status: 404, code: 'not_found'}]})
  assert.deepEqual(await drop(A, bp.send, 10), {gone: true, said: `${A} was already gone`})
  bp.close()
  assert.deepEqual(bp.calls.map((c) => c.query), ['', `?dataset_id=${RUN}`])
})

test('a rolled-back 503 or a refusing 409 keeps the dataset after one DELETE', async () => {
  const refusals: Reply[] = [
    ...['dataset_delete_timeout', 'dataset_delete_contended', 'dataset_delete_database', 'dataset_delete_interrupted'].map((reason) => ({status: 503, reason})),
    ...['halted', 'production_dataset_protected', 'dataset_in_shared_search', 'dataset_media_referenced'].map((code) => ({status: 409, code})),
  ]
  for (const r of refusals) {
    const bp = await fakeBarkpark({[A]: [r, 200]})
    const out = await drop(A, bp.send, 10)
    bp.close()
    const {status, code, reason} = r as {status: number; code?: string; reason?: string}
    assert.equal(out.gone, false)
    assert.match(out.said, new RegExp(`^kept ${A}: Barkpark ${status} .*${reason ?? code}`))
    assert.equal(bp.calls.length, 1)
  }
})

test('a delete that stays at 202 stops polling at the cap and says it is kept', async () => {
  const bp = await fakeBarkpark({[A]: [202]})
  const started = Date.now()
  const out = await drop(A, bp.send, 20, 150)
  bp.close()
  assert.equal(out.gone, false)
  assert.match(out.said, /still deleting/)
  assert.ok(Date.now() - started < 400)
  assert.ok(bp.calls.length >= 3 && bp.calls.length <= 9, `${bp.calls.length} DELETEs`)
})

test('production, fixtures and any other name are refused before a request goes out', async () => {
  const bp = await fakeBarkpark({})
  for (const name of ['production', 'fixtures', 'e2e-latest', 'j10-2026']) await assert.rejects(drop(name, bp.send, 10), /only throwaway run datasets/)
  bp.close()
  assert.equal(bp.calls.length, 0)
})

test('one at a time: the next dataset gets its first DELETE only after the last one is gone', async () => {
  const bp = await fakeBarkpark({[A]: [202, 202, 200], [B]: [200]})
  const said: string[] = []
  assert.equal(await dropEach([A, B], (d) => drop(d, bp.send, 20), (l) => said.push(l)), true)
  bp.close()
  assert.deepEqual(bp.calls.map((c) => c.path.split('/').pop()), [A, A, A, B])
  assert.deepEqual(said, [`dropped ${A} (3 documents)`, `dropped ${B} (3 documents)`])
})

test('one at a time: a dataset that is not gone stops the rest', async () => {
  const bp = await fakeBarkpark({[A]: [503], [B]: [200]})
  const said: string[] = []
  assert.equal(await dropEach([A, B], (d) => drop(d, bp.send, 20), (l) => said.push(l)), false)
  bp.close()
  assert.deepEqual(bp.calls.map((c) => c.path.split('/').pop()), [A])
  assert.equal(said.length, 1)
})

test('a 202 with no dataset_id is kept: a poll never goes out without the run it polls', async () => {
  const bp = await fakeBarkpark({[A]: [{status: 202, id: null}, 200]})
  const out = await drop(A, bp.send, 10)
  bp.close()
  assert.equal(out.gone, false)
  assert.match(out.said, /named no dataset_id/)
  assert.equal(bp.calls.length, 1)
})

test('a 503 dataset_delete_busy waits Retry-After seconds, then sends the same DELETE again', async () => {
  const bp = await fakeBarkpark({[A]: [202, {status: 503, reason: 'dataset_delete_busy', retryAfter: 1}, 200]})
  const out = await drop(A, bp.send, 20)
  bp.close()
  assert.deepEqual(out, {gone: true, said: `dropped ${A} (3 documents)`})
  assert.deepEqual(bp.calls.map((c) => c.query), ['', `?dataset_id=${RUN}`, `?dataset_id=${RUN}`])
  assert.ok(bp.calls[2]!.at - bp.calls[1]!.at >= 950, `waited ${bp.calls[2]!.at - bp.calls[1]!.at} ms after the busy answer`)
})

test('a busy 503 on the first DELETE, before any run, waits Retry-After and asks again without a dataset_id', async () => {
  const bp = await fakeBarkpark({[A]: [{status: 503, reason: 'dataset_delete_busy', retryAfter: 1}, 202, 200]})
  const out = await drop(A, bp.send, 20)
  bp.close()
  assert.deepEqual(out, {gone: true, said: `dropped ${A} (3 documents)`})
  assert.deepEqual(bp.calls.map((c) => c.query), ['', '', `?dataset_id=${RUN}`])
  assert.ok(bp.calls[1]!.at - bp.calls[0]!.at >= 950, `waited ${bp.calls[1]!.at - bp.calls[0]!.at} ms after the busy answer`)
})

test('a busy 503 whose Retry-After runs past the cap is kept without waiting it out', async () => {
  const bp = await fakeBarkpark({[A]: [{status: 503, reason: 'dataset_delete_busy', retryAfter: 30}]})
  const started = Date.now()
  const out = await drop(A, bp.send, 20, 1_000)
  bp.close()
  assert.equal(out.gone, false)
  assert.match(out.said, /still busy/)
  assert.ok(Date.now() - started < 500)
  assert.equal(bp.calls.length, 1)
})

test('a 409 dataset_recreated after a 202 is kept with its body, and nothing is sent again', async () => {
  const bp = await fakeBarkpark({[A]: [202, {status: 409, code: 'dataset_recreated'}, 200]})
  const out = await drop(A, bp.send, 10)
  bp.close()
  assert.equal(out.gone, false)
  assert.match(out.said, new RegExp(`^kept ${A}: Barkpark 409 .*dataset_recreated`))
  assert.deepEqual(bp.calls.map((c) => c.query), ['', `?dataset_id=${RUN}`])
})

test('only a busy 503 is retried: a rolled-back 503 with a Retry-After is still kept after one DELETE', async () => {
  const bp = await fakeBarkpark({[A]: [{status: 503, reason: 'dataset_delete_timeout', retryAfter: 1}, 200]})
  const out = await drop(A, bp.send, 10)
  bp.close()
  assert.equal(out.gone, false)
  assert.equal(bp.calls.length, 1)
})

test('an answer that is not JSON, even with a JSON content type, keeps the dataset and says what came back', async () => {
  for (const status of [200, 404, 502]) {
    const bp = await fakeBarkpark({[A]: [{status, html: true}]})
    const out = await drop(A, bp.send, 10)
    bp.close()
    assert.equal(out.gone, false)
    assert.match(out.said, new RegExp(`^kept ${A}: Barkpark ${status} answered with something that is not JSON: <html>`))
    assert.equal(bp.calls.length, 1)
  }
})

const PID = 4242
const MINE = `e2e-20261030080000-${PID}`

test('a passing run drops only the datasets it made itself', () => {
  const other = `e2e-20261030080000-${PID + 1}`
  const longerPid = `e2e-20261030080000-1${PID}`
  const named = 'probe-p3g-latest'
  assert.deepEqual(toDrop([MINE, `j10-20261030080000-${PID}`, other, longerPid, named, 'production', 'fixtures'], 'passed', PID), {
    drop: [MINE, `j10-20261030080000-${PID}`],
    kept: [other, longerPid, named, 'production', 'fixtures'].map((d) => `kept ${d}: this run did not make it`),
  })
})

test('a run that did not pass drops nothing', () => {
  for (const status of ['failed', 'timedout', 'interrupted']) assert.deepEqual(toDrop([MINE], status, PID), {drop: [], kept: [`kept ${MINE}: the run did not pass, so it stays to look at`]})
})

test('the sweep takes only run datasets older than 2 hours, oldest first, never one stamped in the future', () => {
  const now = Date.UTC(2026, 9, 30, 12, 0, 0)
  const all = ['e2e-20261030095959-1', 'j10-20261030100000-2', 'e2e-20261030110000-3', 'e2e-20261030150000-5', 'production', 'fixtures', 'probe-p3h-20261029120000', 'notes-20261029120000', 'e2e-20261030080000-4']
  assert.deepEqual(stale(all, now), ['e2e-20261030080000-4', 'e2e-20261030095959-1', 'probe-p3h-20261029120000'])
})

const NOW = Date.UTC(2026, 9, 30, 12, 0, 0)
const OLD = ['e2e-20261030080000-1', 'j10-20261030090000-2']
const listing = (slugs: string[]) => new Response(JSON.stringify({datasets: slugs.map((slug) => ({slug}))}), {headers: {'content-type': 'application/json'}})

function sweeper(answers: Record<string, boolean>) {
  const tried: string[] = []
  const said: string[] = []
  const one = async (d: string): Promise<Dropped> => (tried.push(d), {gone: answers[d] ?? true, said: `${d} ${answers[d] ?? true}`})
  return {tried, said, one, say: (l: string) => said.push(l)}
}

test('the sweep is a dry run without --yes: it names the old run datasets and deletes nothing', async () => {
  const s = sweeper({})
  assert.equal(await sweep(listing([...OLD, 'e2e-20261030113000-3', 'production']), NOW, false, s.one, s.say), true)
  assert.deepEqual(s.tried, [])
  assert.deepEqual(s.said, ['4 datasets, 2 leftover run datasets older than 2 hours (dry run; --yes deletes them):', ...OLD.map((n) => `  ${n}`)])
})

test('the sweep with --yes deletes only the old run datasets, one at a time, and stops at one that is not gone', async () => {
  const all = sweeper({})
  assert.equal(await sweep(listing([...OLD, 'e2e-20261030113000-3', 'production']), NOW, true, all.one, all.say), true)
  assert.deepEqual(all.tried, OLD)
  const stuck = sweeper({[OLD[0]!]: false})
  assert.equal(await sweep(listing(OLD), NOW, true, stuck.one, stuck.say), false)
  assert.deepEqual(stuck.tried, [OLD[0]])
  assert.match(stuck.said.at(-1)!, /^stopped: /)
})

test('a failed listing stops the sweep before any delete', async () => {
  const s = sweeper({})
  await assert.rejects(sweep(new Response('no', {status: 401}), NOW, true, s.one, s.say), /listing datasets: Barkpark 401/)
  assert.deepEqual(s.tried, [])
})
