export type Send = (path: string, init: RequestInit) => Promise<Response>
export type Dropped = {gone: boolean; said: string}

const THROWAWAY = /^(e2e|j10|probe-p3[gh])-\d{14}(-\d+)?$/
const OLDER_THAN_MS = 2 * 3600_000
export const throwaway = (dataset: string) => THROWAWAY.test(dataset)

export function toDrop(made: string[], status: string, pid: number) {
  const mine = (d: string) => status === 'passed' && throwaway(d) && d.endsWith(`-${pid}`)
  const why = status === 'passed' ? 'this run did not make it' : 'the run did not pass, so it stays to look at'
  return {drop: made.filter(mine), kept: made.filter((d) => !mine(d)).map((d) => `kept ${d}: ${why}`)}
}

const madeAt = (name: string) => {
  const [, y, mo, d, h, mi, s] = name.match(/-(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(?:-\d+)?$/)!.map(Number)
  return Date.UTC(y!, mo! - 1, d, h, mi, s)
}

export const stale = (all: string[], now: number) => all.filter((n) => throwaway(n) && now - madeAt(n) > OLDER_THAN_MS).sort()

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

type Answer = {documents?: number; dataset_id?: string; error?: {code?: string; details?: {reason?: string}}}

function parsed(body: string): Answer | undefined {
  try {
    return JSON.parse(body) as Answer
  } catch {
    return undefined
  }
}

const busyFor = (res: Response, answer: Answer) => {
  const seconds = Number(res.headers.get('retry-after'))
  return res.status === 503 && answer.error?.details?.reason === 'dataset_delete_busy' && seconds > 0 ? seconds * 1000 : 0
}

export async function drop(dataset: string, send: Send, every = 2_000, cap = 10 * 60_000): Promise<Dropped> {
  if (!throwaway(dataset)) throw new Error(`only throwaway run datasets get deleted, not "${dataset}"`)
  const until = Date.now() + cap
  let run: string | undefined
  for (;;) {
    const res = await send(`/v1/datasets/${dataset}${run ? `?dataset_id=${encodeURIComponent(run)}` : ''}`, {method: 'DELETE'})
    const body = await res.text()
    const answer = parsed(body)
    const kept = (why: string) => ({gone: false, said: `kept ${dataset}: ${why}`})
    if (!answer) return kept(`Barkpark ${res.status} answered with something that is not JSON: ${body.slice(0, 400)}`)
    if (res.status === 404) return {gone: true, said: `${dataset} was already gone`}
    if (res.status === 200) return {gone: true, said: `dropped ${dataset} (${answer.documents} documents)`}
    if (res.status === 202 && !answer.dataset_id) return kept(`Barkpark 202 named no dataset_id, so there is nothing safe to poll: ${body.slice(0, 400)}`)
    if (res.status === 202) run = answer.dataset_id
    const wait = res.status === 202 ? every : busyFor(res, answer)
    if (!wait) return kept(`Barkpark ${res.status} ${body.slice(0, 400)}`)
    if (Date.now() + wait > until) return kept(`Barkpark is still ${res.status === 202 ? 'deleting it' : 'busy'} after ${Math.round(cap / 1000)} s; the next DELETE picks the run up`)
    await pause(wait)
  }
}

export async function dropEach(datasets: string[], one: (dataset: string) => Promise<Dropped>, say: (line: string) => void): Promise<boolean> {
  for (const dataset of datasets) {
    const {gone, said} = await one(dataset)
    say(said)
    if (!gone) return false
  }
  return true
}
