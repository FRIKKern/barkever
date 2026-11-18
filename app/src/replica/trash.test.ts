import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blockText, type Block} from '../lib/model.ts'
import type {NoteDoc} from './note.ts'
import type {Entry} from './db.ts'
import {newDevice, use, type Device} from '../chaos/fake-db.ts'
import {answer} from '../chaos/fake-remote.ts'
import {canon, digest, sign, writerOf} from './sign.ts'

const {forgetJournal} = await import('./journal.ts')
const {createNote, deleteForever, editBody, editTitle, restoreNote, trashNote} = await import('./local.ts')
const {dropIfBlank, dropBlankDrafts} = await import('./drop.ts')
const {ack} = await import('./settle.ts')
const {settle} = await import('./settle.ts')
const {mutationFor, push} = await import('../sync/push.ts')

const p = (id: string, text: string): Block => ({id, type: 'paragraph', content: [{type: 'text', value: text}]})
const PLAN: NoteDoc = {_id: 'n1', _type: 'note', _rev: 'r1', title: 'Plan', notebook: {_type: 'reference', _ref: 'nb-work'}, tags: ['harbor', 'p3'], links: [{_type: 'reference', _ref: 'n2', _key: 'n2'}], body: {blocks: [p('a', 'pump the bilge'), p('b', 'see [[n2]]')]}}

function device(): Device {
  const d = newDevice('dev-me')
  use(d)
  forgetJournal()
  d.stores.notes.set('n1', PLAN)
  d.stores.rows.set('n1', {id: 'n1', rev: 'r1'})
  return d
}

const local = (d: Device) => d.stores.notes.get('n1') as NoteDoc
const entry = (d: Device) => d.stores.outbox.get('n1') as Entry | undefined
const kept = ({title, notebook, tags, links, body}: NoteDoc) => ({title, notebook, tags, links, body})
const texts = (d: Device) => (local(d).body?.blocks ?? []).map(blockText)

function server(start: NoteDoc) {
  let doc: NoteDoc = start
  let rev = 1
  const seen: unknown[] = []
  answer({
    mutate: async (ms) => {
      seen.push(...ms)
      for (const m of ms as {patch?: {set: Partial<NoteDoc>; unset?: string[]}}[]) {
        if (!m.patch) continue
        const next: Record<string, unknown> = {...doc, ...m.patch.set, _rev: `r${++rev}`}
        for (const f of m.patch.unset ?? []) delete next[f]
        doc = next as NoteDoc
      }
      return {status: 200, docs: ms.map(() => doc as never)}
    },
    docs: async () => [doc as never],
    manifest: async () => ({note: [{id: 'n1', rev: doc._rev!}], notebook: []}),
  })
  return {doc: () => doc, seen}
}

test('delete moves the note to trash and keeps its title, body, tags, notebook and links', async () => {
  const d = device()
  await trashNote('n1')
  assert.ok(local(d).trashed, 'the note says when it went to trash')
  assert.deepEqual(kept(local(d)), kept(PLAN))
  assert.ok(d.stores.rows.has('n1'))
})

test('restore brings everything back exactly, and the note is no longer in trash', async () => {
  const d = device()
  await trashNote('n1')
  await restoreNote('n1')
  assert.equal(local(d).trashed, undefined)
  assert.deepEqual(kept(local(d)), kept(PLAN))
})

test('trash goes out as a field edit on the note, never as a delete', async () => {
  const d = device()
  await trashNote('n1')
  const m = mutationFor(entry(d)!, local(d)) as {patch: {set: {trashed?: string}; ifRevisionID: string}}
  assert.ok(m.patch, JSON.stringify(m))
  assert.equal(m.patch.set.trashed, local(d).trashed)
  assert.equal(m.patch.ifRevisionID, 'r1')
})

test('trash then restore before a sync sends nothing; restore after a synced trash unsets the field', async () => {
  const d = device()
  await trashNote('n1')
  await restoreNote('n1')
  assert.equal(mutationFor(entry(d)!, local(d)), null)
  const s = server(PLAN)
  await trashNote('n1')
  await push()
  assert.ok(s.doc().trashed)
  assert.equal(entry(d), undefined)
  await restoreNote('n1')
  const m = mutationFor(entry(d)!, local(d)) as {patch: {unset?: string[]}}
  assert.deepEqual(m.patch.unset, ['trashed'])
})

test('offline: words typed, then trash, then restore; on reconnect Barkpark gets the words and the note is not in trash', async () => {
  const d = device()
  await editBody('n1', PLAN.body!.blocks, [p('a', 'pump the bilge twice'), p('b', 'see [[n2]]')])
  await trashNote('n1')
  assert.deepEqual(texts(d), ['pump the bilge twice', 'see [[n2]]'])
  await restoreNote('n1')
  const s = server(PLAN)
  await push()
  assert.deepEqual(s.doc().body?.blocks.map(blockText), ['pump the bilge twice', 'see [[n2]]'])
  assert.equal(s.doc().trashed, undefined)
  assert.equal(entry(d), undefined)
})

test('a trashed note with unsynced words syncs both the words and the trash', async () => {
  const d = device()
  await editBody('n1', PLAN.body!.blocks, [p('a', 'pump the bilge'), p('b', 'see [[n2]]'), p('c', 'new line')])
  await trashNote('n1')
  const s = server(PLAN)
  await push()
  assert.deepEqual(s.doc().body?.blocks.map(blockText), ['pump the bilge', 'see [[n2]]', 'new line'])
  assert.ok(s.doc().trashed)
  assert.deepEqual(texts(d), ['pump the bilge', 'see [[n2]]', 'new line'])
})

test('a remote edit to a note trashed here keeps it trashed, with their words', async () => {
  const d = device()
  await trashNote('n1')
  await settle('note', 'n1', {...PLAN, _rev: 'r2', body: {blocks: [p('a', 'pump the bilge'), p('b', 'see [[n2]]'), p('c', 'theirs')]}}, () => 'apply')
  assert.ok(local(d).trashed)
  assert.deepEqual(texts(d), ['pump the bilge', 'see [[n2]]', 'theirs'])
})

test('a remote trash of a note edited here keeps my words, and the note goes to trash', async () => {
  const d = device()
  await editBody('n1', PLAN.body!.blocks, [p('a', 'pump the bilge'), p('b', 'see [[n2]]'), p('c', 'mine')])
  await settle('note', 'n1', {...PLAN, _rev: 'r2', trashed: '2026-11-18T10:00:00.000Z'}, () => 'apply')
  assert.equal(local(d).trashed, '2026-11-18T10:00:00.000Z')
  assert.deepEqual(texts(d), ['pump the bilge', 'see [[n2]]', 'mine'])
})

test('a note that was never in trash keeps the signature it had before trash existed', () => {
  const old = digest(canon([PLAN.title, PLAN.notebook, PLAN.tags, PLAN.body, PLAN.links, PLAN.conflicts]))
  assert.equal(sign(PLAN, 'dev-a').by, `dev-a.${old}`)
  const trashed = sign({...PLAN, trashed: '2026-11-18T10:00:00.000Z'}, 'dev-a')
  assert.notEqual(trashed.by, `dev-a.${old}`)
  assert.equal(writerOf(trashed), 'dev-a')
  assert.equal(writerOf({...trashed, trashed: undefined}), undefined)
})

test('delete forever leaves a note alone once it is out of trash, so a restore elsewhere is never erased', async () => {
  const d = device()
  await trashNote('n1')
  await ack(entry(d)!, {...local(d), _rev: 'r2'})
  await settle('note', 'n1', {...PLAN, _rev: 'r3', body: {blocks: [...PLAN.body!.blocks, p('c', 'restored and typed on')]}}, () => 'apply')
  assert.equal(await deleteForever('n1'), false)
  assert.deepEqual(texts(d), ['pump the bilge', 'see [[n2]]', 'restored and typed on'])
  assert.equal(entry(d), undefined)
  await trashNote('n1')
  assert.equal(await deleteForever('n1'), true)
  assert.equal(local(d), undefined)
  assert.ok(entry(d)?.delete)
})

test('Move to Trash on a note whose main went blank but whose kept version holds their words trashes it, never erases it', async () => {
  const d = device()
  await editTitle('n1', 'Plan', '')
  await editBody('n1', PLAN.body!.blocks, [{id: 'a', type: 'paragraph', content: []}])
  await settle('note', 'n1', {...PLAN, _rev: 'r2', title: 'Plan v2 (their words)', by: 'dev-other.x'}, () => 'apply')
  assert.equal(local(d).title, '')
  assert.ok(local(d).conflicts?.some((c) => c.title === 'Plan v2 (their words)'))
  await trashNote('n1')
  assert.ok(local(d).trashed)
  assert.ok(local(d).conflicts?.some((c) => c.title === 'Plan v2 (their words)'))
  assert.ok(!entry(d)?.delete)
})

test('a blank new note moved to Trash while the editor still holds unsaved words keeps them: leaving it sweeps nothing, and the words land in Trash', async () => {
  const d = device()
  await createNote({id: 'm1', notebook: 'nb-work', blockId: 'm1-p0'})
  const blank = (d.stores.notes.get('m1') as NoteDoc).body!.blocks
  await trashNote('m1')
  await dropIfBlank('m1')
  await editBody('m1', blank, [p('m1-p0', 'words typed while the editor loaded')])
  const m1 = d.stores.notes.get('m1') as NoteDoc | undefined
  assert.ok(m1?.trashed, 'still in Trash')
  assert.deepEqual(m1.body?.blocks.map(blockText), ['words typed while the editor loaded'])
})

test('the blank-note sweeps never take a note from Trash, so Undo always finds it', async () => {
  const d = device()
  await createNote({id: 'm3', notebook: 'nb-work', blockId: 'm3-p0'})
  await trashNote('m3')
  await dropIfBlank('m3')
  await dropBlankDrafts()
  assert.ok((d.stores.notes.get('m3') as NoteDoc | undefined)?.trashed)
  await restoreNote('m3')
  await dropIfBlank('m3')
  assert.equal(d.stores.notes.get('m3'), undefined, 'a restored blank note made here is swept as before')
})
