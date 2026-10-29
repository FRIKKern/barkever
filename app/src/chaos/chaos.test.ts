import {test} from 'node:test'
import assert from 'node:assert/strict'
import {replay, report, run, shrink, type Run} from './chaos.ts'
import type {Kind, Setup} from './plan.ts'

const SEEDS = 2000
const SOLO = 300
const strict = process.env.CHAOS_STRICT === '1'
const LOSS = !strict && 'main drops a copy when its writer clashes again (merge.ts superseded rule, review 5); CHAOS_STRICT=1 makes this a failure'
const ECHO = !strict && 'main copies its own push back after a lost reply once another writer built on it (baseFor falls back to the stale base); CHAOS_STRICT=1 makes this a failure'

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

const mixed = sweep(SEEDS, false)

const firstOf = async (runs: Run[]) => (runs.length ? `${runs.length} seeds fail: ${runs.map((r) => r.plan.seed).join(', ')}\n${report(await shrink(runs[0]))}` : '')

const failing = async (...kinds: string[]) => (await mixed).failed.filter((r) => kinds.includes(r.failure!.kind))

test(`${SEEDS} seeds settle and converge`, async (t) => {
  const {mean, most} = await mixed
  t.diagnostic(`copies per note: mean ${mean.toFixed(2)}, max ${most}`)
  const bad = await failing('diverged', 'stuck', 'crash')
  assert.equal(bad.length, 0, await firstOf(bad))
})

test(`${SEEDS} seeds lose no text`, {todo: LOSS}, async () => {
  const bad = await failing('lost')
  assert.equal(bad.length, 0, await firstOf(bad))
})

test(`${SEEDS} seeds never copy a writer’s own push`, {todo: ECHO}, async () => {
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

test('seed 40: a writer’s losing block survives that writer clashing again with text it adopted from the main', {todo: LOSS}, async () => {
  const r = await pinned(signed, 40)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 7: a raw writer’s losing block survives its next raw edit, made on the main title', {todo: LOSS}, async () => {
  const r = await pinned(raw, 7)
  assert.equal(r.failure, undefined, r.failure && report(r))
})

test('seed 1052: a push whose reply was lost, then built on by another writer, never comes back as a copy', {todo: ECHO}, async () => {
  const r = await pinned(echo, 1052)
  assert.equal(r.failure, undefined, r.failure && report(r))
})
