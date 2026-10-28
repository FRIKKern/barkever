// Test 7: quick capture. 10 × create-note round trips, 3 shapes, with the write-budget headers.
// Paced to stay under the shared token's write budget (spike B uses the same token).
import {mutate, getDoc, para, text} from './lib.mjs'

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const q = (p) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]
  return `median ${q(0.5)} ms · p95 ${q(0.95)} ms · min ${s[0]} · max ${s.at(-1)}`
}
const capture = (i, tag) => ({
  _id: `cap-${tag}-${Date.now()}-${i}`, _type: 'note', title: `Capture ${i}`,
  notebook: {_ref: 'nb-work', _type: 'reference'},
  body: {blocks: [para(`cap-${i}-p1`, text(`Captured thought number ${i}.`))]},
})
const budget = (h) => Object.entries(h).filter(([k]) => /ratelimit|retry-after|x-barkpark-write/i.test(k)).map(([k, v]) => `${k}=${v}`).join(' ')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const runs = {draft: [], 'create+publish': [], 'create→readable': []}
for (let i = 0; i < 10; i++) {
  const a = await mutate([{create: capture(i, 'd')}])
  runs.draft.push(a.ms)
  if (i === 0) console.log('draft create status', a.status, 'headers:', budget(a.headers) || '(no rate-limit headers)')
  const doc = capture(i, 'p')
  const b = await mutate([{create: doc}, {publish: {id: doc._id, type: 'note'}}])
  runs['create+publish'].push(b.ms)
  if (b.status !== 200) console.log('create+publish', b.status, JSON.stringify(b.body).slice(0, 300))
  // Create, then read it back (what another device would do after the listen event).
  const c0 = performance.now()
  const cdoc = capture(i, 'r')
  await mutate([{create: cdoc}])
  const g = await getDoc('note', cdoc._id)
  runs['create→readable'].push(+(performance.now() - c0).toFixed(1))
  if (g.status !== 200) console.log('readback', g.status)
  await sleep(1500) // 3 writes per loop, ≈ 40 writes/min — under 60/min
}
for (const [k, v] of Object.entries(runs)) console.log(`${k.padEnd(16)} ${stats(v)}  raw ${JSON.stringify(v)}`)
