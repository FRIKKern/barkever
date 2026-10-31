import {test} from 'node:test'
import assert from 'node:assert/strict'

const page = new EventTarget()
const Tab = BroadcastChannel
const opened: BroadcastChannel[] = []
function quiet(name: string) {
  const tab = new Tab(name) as BroadcastChannel & {unref(): void}
  tab.unref()
  opened.push(tab)
  return tab
}
const loose = (name: string) => {
  const tab = new Tab(name)
  setTimeout(() => tab.close(), 4000).unref()
  return tab
}
Object.assign(globalThis, {dispatchEvent: page.dispatchEvent.bind(page), BroadcastChannel: quiet})
const {ANSWERED, answersHeard, reached} = await import('./online.ts')

const fired = () => {
  let n = 0
  page.addEventListener(ANSWERED, () => n++)
  return () => n
}

const nextMessage = (tab: BroadcastChannel) => new Promise<unknown>((done) => (tab.onmessage = (e) => done(e.data)))

test('a failure is no answer', () => {
  const count = fired()
  const before = answersHeard()
  reached(false)
  assert.equal(answersHeard(), before)
  assert.equal(count(), 0)
})

test('Barkpark answering the tab that syncs counts here, fires once, and tells the other tabs', {timeout: 5000}, async () => {
  const other = loose('barkever-reach')
  const told = nextMessage(other)
  const count = fired()
  const before = answersHeard()
  reached(true)
  assert.equal(answersHeard(), before + 1)
  assert.equal(count(), 1)
  assert.equal(await told, true)
  other.close()
})

test('an answer another tab heard counts here', {timeout: 5000}, async () => {
  const other = loose('barkever-reach')
  const count = fired()
  const before = answersHeard()
  const heard = new Promise((done) => page.addEventListener(ANSWERED, done, {once: true}))
  other.postMessage(true)
  await heard
  assert.equal(answersHeard(), before + 1)
  assert.equal(count(), 1)
  other.close()
})

test('one channel to the other tabs, however often it is asked', () => {
  answersHeard()
  reached(true)
  answersHeard()
  assert.equal(opened.length, 1)
})

test('a message on the channel that is not true or false is no answer', {timeout: 5000}, async () => {
  const other = loose('barkever-reach')
  const count = fired()
  const before = answersHeard()
  const heard = new Promise((done) => page.addEventListener(ANSWERED, done, {once: true}))
  other.postMessage({ok: true})
  other.postMessage('yes')
  other.postMessage(true)
  await heard
  await new Promise((done) => setTimeout(done, 100))
  assert.equal(answersHeard(), before + 1)
  assert.equal(count(), 1)
  other.close()
})
