import {test} from 'node:test'
import assert from 'node:assert/strict'
import {tagTally, visibleNotes, withOpenAt} from './scope.ts'
import type {Note} from './model.ts'

const note = (id: string, tags: string[] = []) => ({id, tags, title: id, notebook: null, blocks: [], links: [], updatedAt: id}) as unknown as Note
const ids = (notes: Note[]) => notes.map((n) => n.id)
const shelf = {scope: () => []} as never

test('a tag matches in any case, and the list has one entry per tag, in its most used spelling', () => {
  const notes = [note('a', ['harbor']), note('b', ['Harbor']), note('c', ['harbor', 'Harbor']), note('d', ['tarn'])]
  assert.deepEqual(ids(visibleNotes(notes, {tag: 'HARBOR'}, shelf).notes).sort(), ['a', 'b', 'c'])
  assert.deepEqual(tagTally(notes), [['harbor', 3], ['tarn', 1]])
})

test('an open note outside the window keeps its row as the window grows', () => {
  const notes = 'abcdefgh'.split('').map((id) => note(id))
  assert.deepEqual(ids(withOpenAt(notes, 3, 'g', 3)), ['a', 'b', 'c', 'g'])
  assert.deepEqual(ids(withOpenAt(notes, 5, 'g', 3)), ['a', 'b', 'c', 'g', 'd', 'e'])
  assert.deepEqual(ids(withOpenAt(notes, 8, 'g', 3)), ['a', 'b', 'c', 'g', 'd', 'e', 'f', 'h'])
  assert.deepEqual(ids(withOpenAt(notes, 3, 'b', -1)), ['a', 'b', 'c'])
  assert.deepEqual(ids(withOpenAt(notes, 3, 'gone', 3)), ['a', 'b', 'c'])
})
