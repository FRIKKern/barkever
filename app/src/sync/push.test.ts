import '../chaos/hooks.ts'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import type {NoteDoc} from '../replica/note.ts'

const {mutationFor} = await import('./push.ts')

const note: NoteDoc = {_id: 'n1', _type: 'note', _rev: 'r1', title: 'Plan', tags: [], links: [], body: {blocks: []}, _typed: ['3.abc.def']}
const sent = (m: object | null) => JSON.stringify(m)

test('the device-only _typed list never reaches Barkpark, on create or on patch', () => {
  const create = mutationFor({id: 'n1', base: null, v: 1, at: 0}, note)
  const patch = mutationFor({id: 'n1', base: {...note, title: 'Old', _typed: undefined}, v: 1, at: 0}, note)
  assert.ok(sent(create).includes('"Plan"') && sent(patch).includes('"Plan"'))
  for (const m of [create, patch]) assert.ok(!sent(m).includes('_typed'), sent(m))
})
