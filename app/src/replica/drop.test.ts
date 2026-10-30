import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'
import {BLANK, HOLDING} from '../lib/blank-shapes.ts'
import {sign} from './sign.ts'
import type {Block} from '../lib/model.ts'
import type {NoteDoc} from './note.ts'

const {createNote} = await import('./local.ts')
const {dropBlankDrafts, dropIfBlank} = await import('./drop.ts')
const {settle} = await import('./settle.ts')

const ME = 'dev-me'

async function made(id: string, blocks: Block[], rev?: string): Promise<Device> {
  const d = newDevice(ME)
  use(d)
  await createNote({id, notebook: 'inbox', blockId: `${id}-p0`})
  const n = d.stores.notes.get(id) as NoteDoc
  d.stores.notes.set(id, {...n, ...(rev && {_rev: rev}), body: {blocks}})
  return d
}

const kept = (d: Device, id: string) => [d.stores.notes.has(id), !!(d.stores.outbox.get(id) as {delete?: true} | undefined)?.delete]

const PATHS: [string, (id: string, blocks: Block[]) => Promise<Device>][] = [
  ['leaving it online', async (id, blocks) => {
    const d = await made(id, blocks, 'r1')
    await dropIfBlank(id)
    return d
  }],
  ['leaving it before it ever synced, so a delete would queue', async (id, blocks) => {
    const d = await made(id, blocks)
    await dropIfBlank(id)
    return d
  }],
  ['the app-start sweep', async (id, blocks) => {
    const d = await made(id, blocks, 'r1')
    await dropBlankDrafts('other')
    return d
  }],
  ['my own version arriving from the server, then the sweep', async (id, blocks) => {
    const d = await made(id, [{id: `${id}-p0`, type: 'paragraph', content: []}], 'r1')
    const theirs = {...sign({...(d.stores.notes.get(id) as NoteDoc), body: {blocks}}, ME), _rev: 'r2'}
    await settle('note', id, theirs, () => 'apply')
    await dropBlankDrafts('other')
    return d
  }],
]

for (const [path, run] of PATHS) {
  for (const [what, blocks] of HOLDING)
    test(`${path}: a note made here holding ${what} stays`, async () => assert.deepEqual(kept(await run('n1', blocks), 'n1'), [true, false]))
  test(`${path}: a note made here holding nothing goes`, async () => assert.equal((await run('n1', BLANK[0][1])).stores.notes.has('n1'), false))
}

test('leaving a note that is already gone does nothing', async () => {
  const d = newDevice(ME)
  use(d)
  await dropIfBlank('gone')
  assert.equal(d.stores.outbox.has('gone'), false)
})

test('the app-start sweep keeps the open note even when it holds nothing', async () => {
  const d = await made('n1', BLANK[0][1], 'r1')
  await dropBlankDrafts('n1')
  assert.deepEqual(kept(d, 'n1'), [true, false])
})
