export type Send = (path: string, init: RequestInit) => Promise<Response>
export type Dropped = {gone: boolean; said: string}

const THROWAWAY = /^(e2e|j10|probe-p3[gh])-\d{14}(-\d+)?$/
export const throwaway = (dataset: string) => THROWAWAY.test(dataset)
export const ownRun = (dataset: string) => throwaway(dataset) && dataset.endsWith(`-${process.pid}`)

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

export async function drop(dataset: string, send: Send, every = 2_000, cap = 10 * 60_000): Promise<Dropped> {
  if (!throwaway(dataset)) throw new Error(`only throwaway run datasets get deleted, not "${dataset}"`)
  const until = Date.now() + cap
  for (;;) {
    const res = await send(`/v1/datasets/${dataset}`, {method: 'DELETE'})
    const body = await res.text()
    if (res.status === 404) return {gone: true, said: `${dataset} was already gone`}
    if (res.status === 200) return {gone: true, said: `dropped ${dataset} (${(JSON.parse(body) as {documents: number}).documents} documents)`}
    if (res.status !== 202) return {gone: false, said: `kept ${dataset}: Barkpark ${res.status} ${body.slice(0, 400)}`}
    if (Date.now() + every > until) return {gone: false, said: `kept ${dataset}: Barkpark is still deleting it after ${Math.round(cap / 1000)} s; the next DELETE picks the run up`}
    await pause(every)
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
