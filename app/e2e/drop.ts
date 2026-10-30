export type Send = (path: string, init: RequestInit) => Promise<Response>
export type Dropped = {gone: boolean; said: string}

const THROWAWAY = /^(e2e|j10|probe-p3[gh])-\d{14}(-\d+)?$/
export const throwaway = (dataset: string) => THROWAWAY.test(dataset)
export const ownRun = (dataset: string) => throwaway(dataset) && dataset.endsWith(`-${process.pid}`)

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

type Answer = {documents?: number; dataset_id?: string; error?: {code?: string; details?: {reason?: string}}}

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
    const answer = (res.headers.get('content-type')?.includes('json') ? JSON.parse(body) : {}) as Answer
    const kept = (why: string) => ({gone: false, said: `kept ${dataset}: ${why}`})
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
