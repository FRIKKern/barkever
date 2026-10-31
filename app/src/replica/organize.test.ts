import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mergeLocal, mergeNote, same} from './merge.ts'
import {move, tagsTo, tickAt, withTag} from './organize.ts'
import {NOTE_FIELDS, type NoteDoc} from './note.ts'

const AT = '2026-10-29T12:00:00.000Z'
const server: NoteDoc = {_id: 'n1', _type: 'note', _rev: 'r0', title: 'Plan', notebook: {_ref: 'nb-work'}, tags: ['harbor'], links: [], body: {blocks: []}}
const changed = (n: NoteDoc) => NOTE_FIELDS.filter((f) => !same(n[f], server[f]))
const local = (n: NoteDoc, [shown, after]: [Partial<NoteDoc>, Partial<NoteDoc>]) => mergeLocal(n, shown, after, AT, 'k', 'me', server)

test('a move changes only the notebook', () => {
  const moved = local(server, move(server, 'nb-work', 'nb-home'))
  assert.equal(moved.notebook?._ref, 'nb-home')
  assert.deepEqual(moved.tags, ['harbor'])
  assert.equal(moved.conflicts, undefined)
  assert.deepEqual(changed(moved), ['notebook'])
})

test('adding and removing tags changes the list and nothing else', () => {
  const tagged = local(server, tagsTo(['harbor'], ['harbor', 'p3']))
  assert.deepEqual(tagged.tags, ['harbor', 'p3'])
  const untagged = local(tagged, tagsTo(['harbor', 'p3'], ['p3']))
  assert.deepEqual(untagged.tags, ['p3'])
  assert.deepEqual(changed(untagged), ['tags'])
})

test('a move here and a retag on another device both survive the merge', () => {
  const mine = local(server, move(server, 'nb-work', 'nb-home'))
  const theirs: NoteDoc = {...server, _rev: 'r1', tags: ['harbor', 'urgent']}
  const merged = mergeNote(server, mine, theirs, AT, 'me')
  assert.equal(merged.notebook?._ref, 'nb-home')
  assert.deepEqual(merged.tags, ['harbor', 'urgent'])
  assert.deepEqual(merged.conflicts ?? [], [])
})

test('a note with no notebook can be moved into one', () => {
  const loose: NoteDoc = {...server, notebook: undefined}
  assert.equal(local(loose, move(loose, null, 'nb-inbox')).notebook?._ref, 'nb-inbox')
})

test('a typed tag matches an existing one in any case, keeps its stored spelling and never doubles', () => {
  assert.deepEqual(withTag(['design'], ['Harbor', 'design'], 'harbor'), ['design', 'Harbor'])
  assert.deepEqual(withTag(['Harbor'], ['Harbor'], 'HARBOR'), ['Harbor'])
  assert.deepEqual(withTag([], [], '  #Field Notes '), ['field-notes'])
  const tags = ['a']
  assert.equal(withTag(tags, [], '  '), tags)
})

test('a tick changes only that line of the body, and a note with no body stays as it is', () => {
  const list = {id: 'c', type: 'list', task: true, items: [{text: 'Pump', checked: false}, {text: 'Oil'}]}
  const n: NoteDoc = {...server, body: {blocks: [{id: 'p', type: 'paragraph', content: []}, list]}}
  const [shown, after] = tickAt(n, {block: 'c', item: 1})
  assert.deepEqual(shown, {body: n.body})
  assert.deepEqual(after, {body: {blocks: [n.body!.blocks[0], {...list, items: [{text: 'Pump', checked: false}, {text: 'Oil', checked: true}]}]}})
  assert.deepEqual(changed(local(n, tickAt(n, {block: 'c', item: 1}))), ['body'])
  const none: NoteDoc = {...server, body: undefined}
  assert.deepEqual(tickAt(none, {block: 'c', item: 0}), [{body: undefined}, {body: undefined}])
})
