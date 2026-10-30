import {test} from 'node:test'
import assert from 'node:assert/strict'
import {replay, report, run, shrink, type Run} from './chaos.ts'
import type {Kind, Setup} from './plan.ts'

const SEEDS = 2000
const SOLO = 300

async function sweep(n: number, solo: boolean) {
  const failed: Run[] = []
  let copies = 0
  let most = 0
  for (let seed = 1; seed <= n; seed++) {
    const r = await run(seed, solo)
    if (r.failure) failed.push(r)
    copies += r.copies
    most = Math.max(most, r.copies)
  }
  return {failed, mean: copies / n, most}
}

let swept: ReturnType<typeof sweep> | undefined
const mixed = () => (swept ??= sweep(SEEDS, false))

const firstOf = async (runs: Run[]) => (runs.length ? `${runs.length} seeds fail: ${runs.map((r) => r.plan.seed).join(', ')}\n${report(await shrink(runs[0]))}` : '')

const failing = async (...kinds: string[]) => (await mixed()).failed.filter((r) => kinds.includes(r.failure!.kind))

test(`${SEEDS} seeds settle and converge`, async (t) => {
  const {mean, most} = await mixed()
  t.diagnostic(`copies per note: mean ${mean.toFixed(2)}, max ${most}`)
  const bad = await failing('diverged', 'stuck', 'crash')
  assert.equal(bad.length, 0, await firstOf(bad))
})

test(`${SEEDS} seeds lose no text`, async () => {
  const bad = await failing('lost')
  assert.equal(bad.length, 0, await firstOf(bad))
})

test(`${SEEDS} seeds never copy a writer’s own push`, async () => {
  const bad = await failing('echo')
  assert.equal(bad.length, 0, await firstOf(bad))
})

test(`${SOLO} seeds of one writer typing alone make no copies`, async () => {
  const {failed} = await sweep(SOLO, true)
  assert.equal(failed.length, 0, await firstOf(failed))
})

type Pin = {setup: Setup; steps: [number, Kind, number, number][]}
const pinned = async ({setup, steps}: Pin, seed: number) => replay({seed, setup, steps: steps.map(([w, k, a, b]) => ({w, k, a, b}))})

const signed: Pin = {
  setup: {writers: 3, raw: false, blocks: 1, solo: false},
  steps: [[1, 'job', 0.642, 0.167], [1, 'job', 0.642, 0.462], [1, 'type', 0.695, 0.043], [1, 'reply', 0.423, 0.424], [1, 'type', 0.411, 0.472], [2, 'type', 0.603, 0.3], [0, 'type', 0.726, 0.31], [2, 'job', 0.885, 0.431]],
}

const raw: Pin = {
  setup: {writers: 2, raw: true, blocks: 3, solo: false},
  steps: [[2, 'raw', 0.368, 0.293], [2, 'raw', 0.144, 0.155], [1, 'type', 0.396, 0.211], [1, 'job', 0.658, 0.99], [1, 'reply', 0.489, 0.23], [1, 'reply', 0.19, 0.555], [0, 'type', 0.173, 0.024], [2, 'raw', 0.085, 0.381]],
}

const echo: Pin = {
  setup: {writers: 3, raw: false, blocks: 2, solo: false},
  steps: [[1, 'type', 0.248, 0.729], [0, 'type', 0.622, 0.704], [1, 'job', 0.675, 0.876], [1, 'reload', 0.91, 0.88], [1, 'type', 0.13, 0.965], [1, 'job', 0.546, 0.861]],
}

const collision: Pin = {
  setup: {writers: 3, raw: true, blocks: 1, solo: false},
  steps: [[3, 'raw', 0.215, 0.371], [0, 'type', 0.801, 0.413], [2, 'type', 0.135, 0.839], [1, 'delete', 0.482, 0.901], [1, 'type', 0.687, 0.351], [2, 'job', 0.622, 0.855], [3, 'raw', 0.338, 0.503], [2, 'reply', 0.272, 0.842]],
}

const narrow: Pin = {
  setup: {writers: 3, raw: false, blocks: 3, solo: false},
  steps: [
    [1, 'job', 0.335, 0.417], [0, 'type', 0.579, 0.457], [2, 'type', 0.902, 0.314], [0, 'job', 0.963, 0.72], [0, 'reply', 0.44, 0.56], [0, 'job', 0.314, 0.242],
    [2, 'job', 0.032, 0.274], [1, 'type', 0.423, 0.782], [2, 'type', 0.434, 0.818], [2, 'reply', 0.144, 0.459], [0, 'frame', 0.934, 0.776], [2, 'reply', 0.493, 0.957],
    [1, 'job', 0.608, 0.615], [0, 'type', 0.953, 0.794], [1, 'reply', 0.806, 0.801], [0, 'frame', 0.118, 0.864], [1, 'reply', 0.185, 0.305], [0, 'reply', 0.271, 0.159],
    [0, 'reply', 0.534, 0.706], [0, 'type', 0.424, 0.96], [2, 'type', 0.499, 0.794], [2, 'net', 0.855, 0.312],
  ],
}

const setBack: Pin = {
  setup: {writers: 2, raw: false, blocks: 1, solo: false},
  steps: [
    [0, 'organize', 0.687, 0.222], [1, 'net', 0.575, 0.845], [0, 'add', 0.216, 0.153], [1, 'type', 0.802, 0.591], [1, 'net', 0.332, 0.976], [0, 'job', 0.559, 0.229], [1, 'type', 0.651, 0.686],
    [1, 'job', 0.757, 0.702], [1, 'frame', 0.573, 0.383], [0, 'delete', 0.059, 0.323], [1, 'reply', 0.303, 0.09], [1, 'add', 0.644, 0.921], [0, 'type', 0.59, 0.847], [1, 'type', 0.465, 0.984],
    [1, 'reply', 0.277, 0.271], [1, 'revert', 0.651, 0.115], [0, 'frame', 0.358, 0.451], [0, 'frame', 0.511, 0.701], [1, 'reply', 0.33, 0.779], [1, 'type', 0.99, 0.665],
  ],
}

const oldSignature: Pin = {
  setup: {writers: 2, raw: true, blocks: 1, solo: false},
  steps: [
    [0, 'type', 0.01, 0.9], [0, 'job', 0.5, 0.5], [0, 'reply', 0.5, 0.5], [2, 'raw', 0.01, 0.9], [0, 'frame', 0.0, 0.9], [0, 'frame', 0.0, 0.9], [0, 'render', 0.5, 0.5], [0, 'job', 0.5, 0.5],
    [0, 'reply', 0.5, 0.5], [0, 'reply', 0.5, 0.5], [0, 'revert', 0.01, 0.0], [2, 'raw', 0.01, 0.9], [0, 'job', 0.5, 0.5], [0, 'job', 0.5, 0.5], [0, 'reply', 0.5, 0.5], [0, 'job', 0.5, 0.5], [0, 'reply', 0.5, 0.5],
  ],
}

const keptTwice: Pin = {
  setup: {writers: 2, raw: false, blocks: 3, solo: false},
  steps: [
    [0, 'net', 0.919, 0.697], [1, 'type', 0.866, 0.055], [0, 'keep', 0.839, 0.363], [1, 'job', 0.783, 0.27], [0, 'net', 0.591, 0.295], [0, 'frame', 0.185, 0.174], [0, 'type', 0.817, 0.153],
    [1, 'type', 0.035, 0.065], [1, 'frame', 0.183, 0.136], [1, 'net', 0.067, 0.974], [0, 'job', 0.069, 0.143], [0, 'net', 0.496, 0.275], [1, 'net', 0.455, 0.975], [0, 'type', 0.807, 0.65],
    [1, 'job', 0.322, 0.42], [0, 'net', 0.913, 0.171], [0, 'job', 0.256, 0.303], [1, 'reply', 0.407, 0.192], [1, 'reply', 0.638, 0.033], [0, 'keep', 0.561, 0.312],
  ],
}

const sameKeyEcho: Pin = {
  setup: {writers: 2, raw: false, blocks: 1, solo: false},
  steps: [
    [0, 'organize', 0.149, 0.46], [1, 'net', 0.808, 0.715], [1, 'net', 0.303, 0.838], [0, 'job', 0.428, 0.655], [1, 'frame', 0.596, 0.723], [1, 'organize', 0.148, 0.658], [1, 'job', 0.431, 0.61],
    [1, 'reload', 0.184, 0.936], [0, 'type', 0.308, 0.421], [1, 'organize', 0.057, 0.291], [1, 'job', 0.701, 0.546],
  ],
}

const laterCarrier: Pin = {
  setup: {writers: 3, raw: true, blocks: 1, solo: false},
  steps: [
    [2, 'type', 0.734, 0.83], [3, 'raw', 0.179, 0.773], [2, 'frame', 0.09, 0.884], [2, 'keep', 0.473, 0.419], [2, 'job', 0.857, 0.819], [1, 'add', 0.043, 0.077], [2, 'type', 0.281, 0.94],
    [2, 'reload', 0.304, 0.647], [2, 'job', 0.742, 0.982], [2, 'keep', 0.121, 0.13],
  ],
}

const neverArrived: Pin = {
  setup: {writers: 2, raw: false, blocks: 1, solo: false},
  steps: [
    [1, 'type', 0.01, 0.9], [1, 'job', 0.5, 0.5], [0, 'frame', 0, 0.9], [0, 'job', 0.5, 0.5], [0, 'job', 0.5, 0.5], [0, 'reply', 0.5, 0.5], [0, 'type', 0.01, 0.9],
    [0, 'drop', 0.5, 0.5], [0, 'job', 0.5, 0.5], [0, 'reply', 0.5, 0.5], [0, 'organize', 0.1, 0.1], [0, 'job', 0.5, 0.5], [0, 'reply', 0.5, 0.5], [1, 'frame', 0, 0.9],
    [1, 'frame', 0, 0.9], [1, 'render', 0.5, 0.5], [1, 'type', 0.01, 0.9], [1, 'reply', 0.5, 0.5], [0, 'organize', 0.1, 0.1], [0, 'job', 0.5, 0.5],
  ],
}

const healed: Pin = {
  setup: {writers: 2, raw: true, blocks: 1, solo: false},
  steps: [[0, 'drop', 0.565, 0.789], [2, 'raw', 0.083, 0.442], [2, 'raw', 0.039, 0.594], [0, 'frame', 0.832, 0.091], [0, 'net', 0.238, 0.931]],
}

test('seed 40: a writer’s losing block survives that writer clashing again with text it adopted from the main', async () => {
  const r = await pinned(signed, 40)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 7: a raw writer’s losing block survives its next raw edit, made on the main title', async () => {
  const r = await pinned(raw, 7)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 1052: a push whose reply was lost, then built on by another writer, never comes back as a copy', async () => {
  const r = await pinned(echo, 1052)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 2337: two devices that clash with one revision on different parts keep both copies, so the raw block survives', async () => {
  const r = await pinned(collision, 2337)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 7424: one device dropping its narrow copy of a revision leaves the other device’s wider copy alone', async () => {
  const r = await pinned(narrow, 7424)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 327: a block set back to text its writer had typed over keeps its copy when another writer overwrites it', async () => {
  const r = await pinned(setBack, 327)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('a title set back to my signed one after a raw write, then refused by a second raw write that keeps my old signature, survives', async () => {
  const r = await pinned(oldSignature, 1)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 84951: two unacked pushes that disagree but carry one new copy key keep what the server shows of them, so a kept text survives', async () => {
  const r = await pinned(keptTwice, 84951)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 107159: two unacked pushes that disagree but carry one new copy key never copy my own landed text back to me', async () => {
  const r = await pinned(sameKeyEcho, 107159)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 139464: a later push still carrying a copy key an earlier push made proves nothing, so a kept text survives', async () => {
  const r = await pinned(laterCarrier, 139464)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('my first push carrying a new copy never reaches the server, the next lands with its reply lost, and my next push is refused: no copy of my own tags comes back', async () => {
  const r = await pinned(neverArrived, 1)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 4523: a flaky spell still running at the end heals with the network, so a writer that lost its catch-up still settles', async () => {
  const r = await pinned(healed, 4523)
  assert.equal(r.failure, undefined, r.failure && report(r))
})
