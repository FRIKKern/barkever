import {test, type TestContext} from 'node:test'
import assert from 'node:assert/strict'
import {afterTyping, TYPING_MS} from './typing.ts'

function clock(t: TestContext) {
  t.mock.timers.enable({apis: ['setTimeout', 'Date'], now: 10_000})
  return {tick: (ms: number) => t.mock.timers.tick(ms)}
}

test('nobody typing: it runs at once', (t) => {
  clock(t)
  let runs = 0
  afterTyping(() => 0, () => runs++)
  assert.equal(runs, 1)
})

test('a key just pressed holds the run until the typing pause is over', (t) => {
  const {tick} = clock(t)
  let runs = 0
  const pressed = Date.now() - 400
  afterTyping(() => pressed, () => runs++)
  tick(TYPING_MS - 401)
  assert.equal(runs, 0)
  tick(1)
  assert.equal(runs, 1)
})

test('keys that keep coming keep holding it, and it runs once, a typing pause after the last key', (t) => {
  const {tick} = clock(t)
  let last = Date.now()
  let runs = 0
  afterTyping(() => last, () => runs++)
  for (let i = 0; i < 10; i++) {
    tick(300)
    last = Date.now()
  }
  tick(TYPING_MS - 1)
  assert.equal(runs, 0)
  tick(1)
  assert.equal(runs, 1)
  tick(10 * TYPING_MS)
  assert.equal(runs, 1)
})

test('a cancelled hold never runs', (t) => {
  const {tick} = clock(t)
  let last = Date.now()
  let runs = 0
  const cancel = afterTyping(() => last, () => runs++)
  tick(500)
  last = Date.now()
  tick(TYPING_MS - 100)
  cancel()
  tick(10 * TYPING_MS)
  assert.equal(runs, 0)
})
