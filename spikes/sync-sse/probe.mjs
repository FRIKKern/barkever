// Probe: print the shape of every frame kind (no tokens, synthetic data only).
import { listen, mutate, TYPE, sleep } from './lib.mjs'

const frames = []
const s = listen({ onFrame: (f) => frames.push(f) })
await sleep(1500)
const id = `probe-${Date.now()}`
const steps = [
  ['create', { create: { _type: TYPE, _id: id, title: 'probe', n: 1 } }],
  ['patch', { patch: { id: `drafts.${id}`, type: TYPE, set: { n: 2 } } }],
  ['publish', { publish: { id, type: TYPE } }],
  ['patch-published', { patch: { id, type: TYPE, set: { n: 3 } } }],
  ['unpublish', { unpublish: { id, type: TYPE } }],
  ['publish2', { publish: { id, type: TYPE } }],
  ['create-draft-twin', { createOrReplace: { _type: TYPE, _id: `drafts.${id}`, title: 'probe draft', n: 4 } }],
  ['discardDraft', { discardDraft: { id, type: TYPE } }],
  ['delete', { delete: { id, type: TYPE } }],
]
for (const [name, m] of steps) {
  try {
    const r = await mutate([m])
    console.log(`> ${name}: ok results=${JSON.stringify(r.results.map((x) => [x.id, x.operation]))}`)
  } catch (e) { console.log(`> ${name}: ${e.message}`) }
  await sleep(400)
}
await sleep(1500)
s.close()
for (const f of frames) {
  const d = f.json || {}
  const r = d.result || {}
  console.log(JSON.stringify({ event: f.event, id: f.id, comment: f.comment, keys: Object.keys(d), mutation: d.mutation, documentId: d.documentId, rev: d.rev?.slice(0, 8), previousRev: d.previousRev?.slice?.(0, 8) ?? d.previousRev, resultId: r._id, resultRev: r._rev?.slice(0, 8), resultKeys: Object.keys(r) }))
}
