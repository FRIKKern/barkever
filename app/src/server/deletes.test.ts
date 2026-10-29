import {test} from 'node:test'
import assert from 'node:assert/strict'
import {exactDeletes, type Row} from './deletes.ts'

const rows = (...rs: Row[]) => new Map(rs.map((r) => [r._id, r]))
const del = (ifRevisionID?: string) => ({delete: {id: 'n1', type: 'note', ...(ifRevisionID && {ifRevisionID})}})

test('bug 2: a note edited online (draft over published) deletes both rows, fenced on the rev I saw', () => {
  assert.deepEqual(exactDeletes(del('rD'), rows({_id: 'drafts.n1', _rev: 'rD'}, {_id: 'n1', _rev: 'rP'})), [
    {delete: {id: 'drafts.n1', type: 'note', ifRevisionID: 'rD'}},
    {delete: {id: 'n1', type: 'note', ifRevisionID: 'rP'}},
  ])
})

test('bug 2: a published-only or draft-only note deletes its one row with my rev', () => {
  assert.deepEqual(exactDeletes(del('rP'), rows({_id: 'n1', _rev: 'rP'})), [{delete: {id: 'n1', type: 'note', ifRevisionID: 'rP'}}])
  assert.deepEqual(exactDeletes(del('rD'), rows({_id: 'drafts.n1', _rev: 'rD'})), [{delete: {id: 'drafts.n1', type: 'note', ifRevisionID: 'rD'}}])
})

test('bug 2: a note already gone needs no delete, and a delete without a rev fences on what is there', () => {
  assert.deepEqual(exactDeletes(del('rD'), rows()), [])
  assert.deepEqual(exactDeletes(del(), rows({_id: 'drafts.n1', _rev: 'rD'})), [{delete: {id: 'drafts.n1', type: 'note', ifRevisionID: 'rD'}}])
})

test('a stale rev still reaches Barkpark so it can answer 412', () => {
  assert.deepEqual(exactDeletes(del('old'), rows({_id: 'drafts.n1', _rev: 'rD'})), [{delete: {id: 'drafts.n1', type: 'note', ifRevisionID: 'old'}}])
})

test('force rides along to every row, so a note other notes link to still deletes', () => {
  const out = exactDeletes({delete: {id: 'n1', type: 'note', ifRevisionID: 'rD', force: true}}, rows({_id: 'drafts.n1', _rev: 'rD'}, {_id: 'n1', _rev: 'rP'}))
  assert.deepEqual(out.map((m) => m.delete.force), [true, true])
})
