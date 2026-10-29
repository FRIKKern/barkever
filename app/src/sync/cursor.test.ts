import {test} from 'node:test'
import assert from 'node:assert/strict'
import {keeper, SETTLE_MS, type Kept} from './cursor.ts'

const clock = () => {
  let t = 0
  return {now: () => t, at: (ms: number) => void (t = ms)}
}

const replay = (kept: Kept, ids: number[]) => {
  const k = keeper(kept, () => 0)
  return ids.filter((id) => kept.cursor === null || id > kept.cursor).filter((id) => !k.seen(id))
}

test('a first boot has no cursor, and frames younger than the settle window give it none', () => {
  const c = clock()
  const k = keeper({cursor: null, seen: []}, c.now)
  assert.equal(k.since, null)
  k.saw(10)
  c.at(SETTLE_MS - 1)
  assert.deepEqual(k.keep(), {cursor: null, seen: [10], due: 1})
  c.at(SETTLE_MS)
  assert.deepEqual(k.keep(), {cursor: 10, seen: [], due: undefined})
})

test('the cursor moves to the highest id seen one settle window ago, not the highest seen', () => {
  const c = clock()
  const k = keeper({cursor: 50, seen: []}, c.now)
  k.saw(100)
  c.at(1000)
  k.saw(105)
  c.at(30_000)
  k.saw(103)
  c.at(SETTLE_MS)
  assert.deepEqual(k.keep(), {cursor: 100, seen: [105, 103], due: 1000})
  c.at(SETTLE_MS + 1000)
  assert.deepEqual(k.keep(), {cursor: 105, seen: [], due: undefined})
})

test('spike C: a write still committing below the highest id at a reload is replayed, the ones already seen are skipped', () => {
  const c = clock()
  const k = keeper({cursor: 50, seen: []}, c.now)
  for (const id of [100, 101, 105]) k.saw(id)
  c.at(10_000)
  const kept = k.keep()
  assert.equal(kept.cursor, 50)
  assert.deepEqual(replay(kept, [100, 101, 102, 103, 104, 105]), [102, 103, 104])
})

test('the rewind is time, not ids: twenty thousand ids seen in a burst replay none of them a window later', () => {
  const c = clock()
  const k = keeper({cursor: 1, seen: []}, c.now)
  for (let id = 2; id <= 20_001; id++) k.saw(id)
  c.at(SETTLE_MS)
  const kept = k.keep()
  assert.deepEqual(kept, {cursor: 20_001, seen: [], due: undefined})
  assert.equal(keeper(kept, c.now).since, 20_001)
})

test('a stream that closed inside the window never settles what it saw, however late the cursor is kept', () => {
  const c = clock()
  const k = keeper({cursor: 50, seen: []}, c.now)
  k.saw(100)
  c.at(5000)
  k.stop()
  c.at(10 * SETTLE_MS)
  assert.deepEqual(k.keep(), {cursor: 50, seen: [100], due: undefined})
})

test('seen holds only ids above the cursor, so it stays as small as one window of frames', () => {
  const c = clock()
  const k = keeper({cursor: 10, seen: [5, 11, 12]}, c.now)
  assert.equal(k.seen(11), true)
  assert.deepEqual(k.keep().seen, [11, 12])
  k.saw(12)
  k.saw(20)
  c.at(SETTLE_MS)
  assert.deepEqual(k.keep(), {cursor: 20, seen: [], due: undefined})
})

test('an id at or below the cursor that arrives live is new, and leaves the cursor where it is', () => {
  const c = clock()
  const k = keeper({cursor: 100, seen: []}, c.now)
  assert.equal(k.seen(90), false)
  k.saw(90)
  c.at(SETTLE_MS)
  assert.deepEqual(k.keep(), {cursor: 100, seen: [], due: undefined})
})
