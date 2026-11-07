import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'
import type {NoteDoc} from './note.ts'

const device: Device = newDevice('A')
use(device)
const {db, replicaKey} = await import('./db.ts')
const {jot, jotted, unjot} = await import('./journal.ts')
const {replayJournal} = await import('./local.ts')

const put = async (id: string, title: string) => (await db()).put('notes', {_id: id, _type: 'note', _rev: 'r1', title} as NoteDoc)
const seen = async (id: string) => (await (await db()).get('notes', id)) as NoteDoc
const titles = (n: NoteDoc) => (n.conflicts ?? []).map((c) => c.title)

const seq = (id: string, shown: string, title: string) => jot(id, {shown, title})

await put('renamed', 'Newer from another device')
seq('renamed', 'Old', 'Mine')
await put('nothing-else', 'Old')
seq('nothing-else', 'Old', 'Mine')
await put('in-flight', 'First')
const first = seq('in-flight', 'Old', 'First')
seq('in-flight', 'First', 'Second')
unjot('in-flight', first)
await put('both-failed', 'Old')
seq('both-failed', 'Old', 'First')
seq('both-failed', 'First', 'Second')
await put('landed', 'Mine')
seq('landed', 'Old', 'Mine')
await put('old-shape', 'Old')
const journal = JSON.parse(localStorage.getItem(`${replicaKey()}-journal`)!)
journal['old-shape'] = {seq: 1, title: 'From the last version', titleSeq: 1}
localStorage.setItem(`${replicaKey()}-journal`, JSON.stringify(journal))

await replayJournal()

test('a journaled title replayed over a newer remote title keeps both', async () => {
  const n = await seen('renamed')
  assert.equal(n.title, 'Mine')
  assert.deepEqual(titles(n), ['Newer from another device'])
})

test('a journaled title over the title it was typed on makes no copy', async () => {
  const n = await seen('nothing-else')
  assert.equal(n.title, 'Mine')
  assert.deepEqual(titles(n), [])
})

test('a first title that landed, then a second left in the journal, makes no copy', async () => {
  const n = await seen('in-flight')
  assert.equal(n.title, 'Second')
  assert.deepEqual(titles(n), [])
})

test('two titles that both failed replay in order with no copy', async () => {
  const n = await seen('both-failed')
  assert.equal(n.title, 'Second')
  assert.deepEqual(titles(n), [])
})

test('a title that landed but stayed in the journal replays with no copy', async () => {
  const n = await seen('landed')
  assert.equal(n.title, 'Mine')
  assert.deepEqual(titles(n), [])
})

test('a journal written by the last version still replays its title', async () => {
  assert.equal((await seen('old-shape')).title, 'From the last version')
})

test('the replay empties the journal', () => {
  assert.deepEqual(jotted(), [])
})
